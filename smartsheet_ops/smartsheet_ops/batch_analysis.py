"""Batch Analysis module for processing Smartsheet data using Azure OpenAI."""

import os
import uuid
import json
import logging
import tiktoken
from dotenv import load_dotenv
from pathlib import Path
from openai import AzureOpenAI
import openai
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
import threading
import time

# Configure logging and status storage
JOBS_DIR = Path(os.path.expanduser("~/.smartsheet_jobs"))
JOBS_DIR.mkdir(exist_ok=True)
log_file = JOBS_DIR / "batch_analysis.log"
status_file = JOBS_DIR / "status.json"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()  # Also log to stderr with reduced verbosity
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables from root .env file
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path, override=True)

# Initialize Azure OpenAI client
client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_API_BASE"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION")
)

from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, field
from datetime import datetime
import asyncio
from enum import Enum


# Initialize status file if it doesn't exist
if not status_file.exists():
    with open(status_file, 'w') as f:
        json.dump({}, f)

class AnalysisType(str, Enum):
    SUMMARIZE = "summarize"
    SENTIMENT = "sentiment"
    INTERPRET = "interpret"
    CUSTOM = "custom"

class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class JobManager:
    """Manages job execution using multiprocessing."""
    
    def __init__(self):
        self.active_processes = {}
        self.status_lock = threading.Lock()
    
    def _load_status(self) -> dict:
        """Load job status from JSON file."""
        try:
            with self.status_lock:
                with open(status_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading status: {e}")
            return {}
    
    def _save_status(self, status: dict):
        """Save job status to JSON file."""
        try:
            with self.status_lock:
                with open(status_file, 'w') as f:
                    json.dump(status, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving status: {e}")
    
    def update_job_status(self, job_id: str, status_update: dict):
        """Update status for a specific job."""
        current_status = self._load_status()
        current_status[job_id] = {**current_status.get(job_id, {}), **status_update}
        self._save_status(current_status)
    
    def get_job_status(self, job_id: str, sheet_id: str) -> dict:
        """Get status for a specific job."""
        current_status = self._load_status()
        status = current_status.get(job_id, {})
        if status:
            status['sheet_id'] = sheet_id
        return status
    
    def cancel_job(self, job_id: str):
        """Cancel a running job."""
        if job_id in self.active_processes:
            process = self.active_processes[job_id]
            if not process.done():
                process.cancel()
            self.active_processes.pop(job_id)
            self.update_job_status(job_id, {
                "status": "cancelled",
                "timestamp": datetime.utcnow().isoformat()
            })

def process_row(row_data: dict) -> dict:
    """Process a single row in a separate process."""
    try:
        content = row_data['content']
        analysis_type = row_data['analysis_type']
        template = row_data['template']
        
        # Select appropriate prompt
        prompt = template["initial_prompt"].replace("{{content}}", content)
        
        # Use Azure OpenAI for analysis
        response = client.chat.completions.create(
            model=os.getenv("AZURE_OPENAI_DEPLOYMENT"),
            messages=[
                {"role": "system", "content": template["system_prompt"]},
                {"role": "user", "content": prompt}
            ],
            max_tokens=template["max_tokens"],
            temperature=0.3
        )
        
        result = response.choices[0].message.content.strip()
        return {
            "row_id": row_data['row_id'],
            "result": result,
            "success": True
        }
    except Exception as e:
        return {
            "row_id": row_data['row_id'],
            "error": str(e),
            "success": False
        }

@dataclass
class JobData:
    """Data class for storing job information."""
    id: str
    sheet_id: str
    analysis_type: AnalysisType
    source_columns: List[str]
    target_column: str
    row_ids: List[str]
    status: JobStatus = JobStatus.QUEUED
    total_rows: int = 0
    processed: int = 0
    failed: int = 0
    error: Optional[str] = None
    timestamps: Dict[str, str] = field(default_factory=dict)

class BatchProcessor:
    """Manages batch processing of Smartsheet data using Azure OpenAI."""
    
    def __init__(self, batch_size: int = 3):
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("AZURE_OPENAI_API_KEY environment variable not set")
        self.api_base = os.getenv("AZURE_OPENAI_API_BASE")
        if not self.api_base:
            raise ValueError("AZURE_OPENAI_API_BASE environment variable not set")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION")
        if not self.api_version:
            raise ValueError("AZURE_OPENAI_API_VERSION environment variable not set")
        
        self.batch_size = batch_size
        self.job_manager = JobManager()
        self.executor = ThreadPoolExecutor(max_workers=3)  # Limit concurrent threads
        
        logger.info(f"Batch size set to: {self.batch_size}")
        logger.info("BatchProcessor initialized successfully.")
        
        # Initialize tiktoken encoder
        self.encoder = tiktoken.get_encoding("cl100k_base")
        # Initialize Azure OpenAI client for prompt optimization
        self.prompt_optimizer = AzureOpenAI(
            azure_endpoint=os.getenv("AZURE_OPENAI_API_BASE"),
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION")
        )
        
        # Template definitions with system prompts
        self.templates = {
            AnalysisType.SUMMARIZE: {
                "system_prompt": "You are an AI assistant specialized in summarizing text. Provide clear, concise summaries that capture the main points.",
                "initial_prompt": "Summarize the following text concisely: {{content}}",
                "continuation_prompt": "Continue summarizing, incorporating this new content while maintaining consistency with the previous summary: {{content}}\n\nPrevious summary: {{previous_result}}",
                "max_tokens": 150,
                "max_input_tokens": 6000
            },
            AnalysisType.SENTIMENT: {
                "system_prompt": "You are an AI assistant specialized in sentiment analysis. Provide numerical sentiment scores between -1 and 1.",
                "initial_prompt": "Analyze the sentiment of the following text. Return only a number between -1 (most negative) and 1 (most positive): {{content}}",
                "continuation_prompt": "Analyze the sentiment of this additional content, considering it together with the previous analysis ({{previous_result}}). Return a single number between -1 and 1: {{content}}",
                "max_tokens": 10,
                "max_input_tokens": 6000
            },
            AnalysisType.INTERPRET: {
                "system_prompt": "You are an AI assistant specialized in analyzing text for healthcare and medical contexts. Extract key insights and patterns.",
                "initial_prompt": "Interpret and extract key insights from the following text: {{content}}",
                "continuation_prompt": "Continue analysis, incorporating these new items while maintaining consistency with previous insights.\n\nPrevious insights: {{previous_result}}\n\nNew content: {{content}}",
                "max_tokens": 300,
                "max_input_tokens": 6000
            }
        }

    def _cleanup_old_jobs(self):
        """Clean up old job status entries."""
        try:
            current_status = self.job_manager._load_status()
            # Remove completed jobs older than 7 days
            current_time = datetime.utcnow()
            cleaned_status = {}
            for job_id, job_status in current_status.items():
                completed_time = job_status.get("timestamps", {}).get("completed")
                if completed_time:
                    completed_datetime = datetime.fromisoformat(completed_time)
                    if (current_time - completed_datetime).days < 7:
                        cleaned_status[job_id] = job_status
                else:
                    cleaned_status[job_id] = job_status
            self.job_manager._save_status(cleaned_status)
        except Exception as e:
            logger.error(f"Error cleaning up old jobs: {e}", exc_info=True)

    def _count_tokens(self, text: str) -> int:
        """Count the number of tokens in a text string."""
        return len(self.encoder.encode(text))

    def _chunk_content(self, content: str, max_tokens: int) -> List[str]:
        """Split content into chunks that fit within token limits."""
        chunks = []
        current_chunk = []
        current_tokens = 0
        
        # Split into sentences (simple approach)
        sentences = content.split('. ')
        
        for sentence in sentences:
            sentence_tokens = self._count_tokens(sentence)
            
            if current_tokens + sentence_tokens > max_tokens:
                if current_chunk:
                    chunks.append('. '.join(current_chunk) + '.')
                current_chunk = [sentence]
                current_tokens = sentence_tokens
            else:
                current_chunk.append(sentence)
                current_tokens += sentence_tokens
        
        if current_chunk:
            chunks.append('. '.join(current_chunk) + '.')
        
        return chunks

    async def _process_batch(self, content: str, analysis_type: AnalysisType, previous_result: Optional[str] = None) -> str:
        """Process a single batch of content using Azure OpenAI."""
        template = self.templates[analysis_type]
        max_input_tokens = template["max_input_tokens"]
        
        # Check if content needs chunking
        content_tokens = self._count_tokens(content)
        if content_tokens > max_input_tokens:
            chunks = self._chunk_content(content, max_input_tokens)
            logger.info(f"Content split into {len(chunks)} chunks")
            
            # Process chunks sequentially, maintaining context
            result = None
            for chunk in chunks:
                result = await self._process_chunk(chunk, analysis_type, result)
            return result
        else:
            return await self._process_chunk(content, analysis_type, previous_result)

    async def _process_chunk(self, content: str, analysis_type: AnalysisType, previous_result: Optional[str] = None) -> str:
        """Process a single chunk of content."""
        template = self.templates[analysis_type]
        
        # Select appropriate prompt based on whether this is a continuation
        if previous_result:
            prompt = template["continuation_prompt"].replace("{{content}}", content).replace("{{previous_result}}", previous_result)
        else:
            prompt = template["initial_prompt"].replace("{{content}}", content)
        
        # Debug environment variables
        logger.info("Checking Azure OpenAI credentials:")
        logger.info(f"API Key present: {bool(self.api_key)}")
        logger.info(f"API Base present: {bool(self.api_base)}")
        logger.info(f"API Version present: {bool(self.api_version)}")
        logger.info(f"API Base value: {self.api_base}")
        logger.info(f"API Version value: {self.api_version}")
        
        if not self.api_key or not self.api_base or not self.api_version:
            raise ValueError(f"Azure OpenAI credentials not properly configured. API Key: {bool(self.api_key)}, Base: {bool(self.api_base)}, Version: {bool(self.api_version)}")
            
        try:
            deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
            if not deployment:
                raise ValueError("AZURE_OPENAI_DEPLOYMENT environment variable not set")
            
            logger.info(f"Using deployment name: {deployment}")
            logger.info(f"Sending request to Azure OpenAI for analysis type: {analysis_type}")
            
            response = client.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": template["system_prompt"]},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=template["max_tokens"],
                temperature=0.3
            )
            
            analysis_result = response.choices[0].message.content.strip()
            logger.info(f"Successfully processed content with analysis type: {analysis_type}")
            return analysis_result
                    
        except Exception as e:
            logger.error(f"Error processing batch: {str(e)}", exc_info=True)
            raise

    async def _generate_optimized_prompt(self, user_goal: str) -> Dict[str, str]:
        """Generate an optimized system prompt and task prompt based on user goal."""
        deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
        if not deployment:
            raise ValueError("AZURE_OPENAI_DEPLOYMENT environment variable not set")

        try:
            response = self.prompt_optimizer.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": """You are an expert at crafting effective prompts for language models. 
                    Your task is to create an optimized system prompt and task prompt based on a user's goal.
                    The prompts should be clear, specific, and designed to get the best possible results.
                    Use {{content}} as the placeholder for the input text.
                    Return only the prompts in JSON format with 'system_prompt' and 'task_prompt' keys."""},
                    {"role": "user", "content": f"Create optimized prompts for the following goal: {user_goal}"}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            try:
                prompts = json.loads(response.choices[0].message.content)
                if not all(k in prompts for k in ['system_prompt', 'task_prompt']):
                    raise ValueError("Missing required prompt fields")
                
                # Ensure task_prompt uses {{content}} placeholder
                task_prompt = prompts["task_prompt"]
                if "{content}" in task_prompt:
                    task_prompt = task_prompt.replace("{content}", "{{content}}")
                
                return {
                    "system_prompt": prompts["system_prompt"],
                    "initial_prompt": task_prompt,
                    "continuation_prompt": "Continue the analysis, incorporating this new content while maintaining consistency with previous results.\n\nPrevious results: {{previous_result}}\n\nNew content: {{content}}",
                    "max_tokens": 300,
                    "max_input_tokens": 6000
                }
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.error(f"Failed to parse prompt optimization response: {e}", exc_info=True)
                raise
        except openai.APIError as e:
            logger.error(f"Azure OpenAI API error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in prompt optimization: {str(e)}", exc_info=True)
            raise

    def _get_all_row_ids(self, sheet: Any) -> List[str]:
        """Get all row IDs from a sheet."""
        return [str(row.id) for row in sheet.rows]

    async def start_analysis(self, sheet_id: str, analysis_type: AnalysisType,
                           source_columns: List[str], target_column: str,
                           row_ids: Optional[List[str]], smartsheet_client: Any,
                           custom_goal: Optional[str] = None) -> Dict[str, Any]:
        """Start a new batch analysis job."""
        logger.info(f"Starting batch analysis job for sheet {sheet_id}")
        logger.info(f"Analysis type: {analysis_type}")
        
        # Get sheet to validate columns and get all row IDs if not provided
        sheet = smartsheet_client.Sheets.get_sheet(sheet_id)
        column_map = {col.title: col.id for col in sheet.columns}
        
        # Validate columns exist
        for col in source_columns + [target_column]:
            if col not in column_map:
                raise ValueError(f"Column not found: {col}")
        
        # If no row_ids provided, get all rows from sheet
        if not row_ids:
            row_ids = self._get_all_row_ids(sheet)
        
        job_id = str(uuid.uuid4())
        
        try:
            # For custom analysis type, generate optimized prompts
            template = self.templates.get(analysis_type)
            if analysis_type == AnalysisType.CUSTOM:
                if not custom_goal:
                    raise ValueError("Custom goal is required for custom analysis type")
                template = await self._generate_optimized_prompt(custom_goal)
            
            if not template:
                raise ValueError(f"Template not found for analysis type: {analysis_type}")
            
            # Initialize job status
            self.job_manager.update_job_status(job_id, {
                "status": "running",
                "total_rows": len(row_ids),
                "processed": 0,
                "failed": 0,
                "timestamps": {
                    "created": datetime.utcnow().isoformat(),
                    "updated": datetime.utcnow().isoformat()
                }
            })
            
            # Prepare row data for processing
            row_data_list = []
            for row_id in row_ids:
                row = next(row for row in sheet.rows if str(row.id) == row_id)
                content = " ".join(
                    str(cell.value) for cell in row.cells
                    if cell.column_id in [column_map[col] for col in source_columns]
                    and cell.value is not None
                )
                row_data_list.append({
                    "row_id": row_id,
                    "content": content,
                    "analysis_type": analysis_type,
                    "template": template
                })
            
            # Prepare minimal job data
            job_data = {
                'job_id': job_id,
                'sheet_id': sheet_id,
                'api_key': os.getenv("SMARTSHEET_API_KEY"),
                'azure_config': {
                    'endpoint': os.getenv("AZURE_OPENAI_API_BASE"),
                    'api_key': os.getenv("AZURE_OPENAI_API_KEY"),
                    'api_version': os.getenv("AZURE_OPENAI_API_VERSION"),
                    'deployment': os.getenv("AZURE_OPENAI_DEPLOYMENT")
                },
                'batch_size': self.batch_size,
                'target_column_id': column_map[target_column],
                'source_column_ids': [str(column_map[col]) for col in source_columns],
                'template': {
                    'system_prompt': template['system_prompt'],
                    'initial_prompt': template['initial_prompt'],
                    'max_tokens': template['max_tokens']
                },
                'row_ids': row_ids
            }
            
            # Initialize the job in a background thread
            def start_background_job():
                try:
                    future = self.executor.submit(self._coordinate_job, job_data)
                    self.job_manager.active_processes[job_id] = future
                except Exception as e:
                    logger.error(f"Error starting background job: {str(e)}")
                    self.job_manager.update_job_status(job_id, {
                        "status": "failed",
                        "error": str(e),
                        "timestamp": datetime.utcnow().isoformat()
                    })

            # Start the background thread
            background_thread = threading.Thread(target=start_background_job)
            background_thread.daemon = True
            background_thread.start()
            
            # Return immediately with job ID
            return {
                "jobId": job_id,
                "analysisType": analysis_type,
                "status": "queued",
                "message": f"Job started for {len(row_ids)} rows",
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to start analysis job: {str(e)}", exc_info=True)
            self.job_manager.update_job_status(job_id, {
                "status": "failed",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            })
            raise Exception(f"Failed to start analysis job: {str(e)}")

    def _recover_interrupted_jobs(self):
        """Recover jobs that were interrupted."""
        try:
            current_status = self.job_manager._load_status()
            recovered_count = 0
            
            for job_id, job_status in current_status.items():
                if job_status.get("status") == "running":
                    logger.info(f"Found interrupted job {job_id}")
                    self.job_manager.update_job_status(job_id, {
                        "status": "failed",
                        "error": "Job interrupted by server restart",
                        "timestamps": {
                            "failed": datetime.utcnow().isoformat()
                        }
                    })
                    recovered_count += 1
            
            logger.info(f"Recovered {recovered_count} interrupted jobs")
        except Exception as e:
            logger.error(f"Error recovering interrupted jobs: {e}", exc_info=True)

    def _process_queue(self):
        """Process jobs in the queue based on priority."""
        logger.info("Starting job processing queue...")
        current_status = self.job_manager._load_status()
        
        # Get all queued jobs
        queued_jobs = [
            (job_id, job_status) for job_id, job_status in current_status.items()
            if job_status.get("status") == "queued"
        ]
        
        # Sort by priority if available
        queued_jobs.sort(key=lambda x: x[1].get("priority", 0))
        
        for job_id, _ in queued_jobs:
            self._process_rows_in_background(job_id)

    def _process_batch(self, batch: List[str], job_data: Dict, result_queue: Queue, status_queue: Queue):
        """Process a batch of rows in a worker process."""
        try:
            # Initialize fresh clients in worker process
            from . import SmartsheetOperations
            smartsheet_client = SmartsheetOperations(job_data['api_key']).client
            azure_client = AzureOpenAI(
                azure_endpoint=job_data['azure_config']['endpoint'],
                api_key=job_data['azure_config']['api_key'],
                api_version=job_data['azure_config']['api_version']
            )
            
            # Process each row in batch
            for row_id in batch:
                try:
                    # Get row data
                    row = smartsheet_client.Sheets.get_row(
                        job_data['sheet_id'], row_id)
                    
                    # Extract content from source columns
                    content = " ".join(
                        str(cell.value) for cell in row.cells
                        if str(cell.column_id) in job_data['source_column_ids']
                        and cell.value is not None
                    )
                    
                    # Process with Azure OpenAI
                    response = azure_client.chat.completions.create(
                        model=job_data['azure_config']['deployment'],
                        messages=[
                            {"role": "system", "content": job_data['template']['system_prompt']},
                            {"role": "user", "content": job_data['template']['initial_prompt'].replace("{{content}}", content)}
                        ],
                        max_tokens=job_data['template']['max_tokens'],
                        temperature=0.3
                    )
                    
                    result = response.choices[0].message.content.strip()
                    
                    # Queue result
                    result_queue.put({
                        'row_id': row_id,
                        'status': 'success',
                        'result': result
                    })
                    
                except Exception as e:
                    result_queue.put({
                        'row_id': row_id,
                        'status': 'error',
                        'error': str(e)
                    })
                
                # Update status
                status_queue.put({
                    'type': 'progress',
                    'processed': 1
                })
                
        except Exception as e:
            status_queue.put({
                'type': 'worker_error',
                'error': str(e)
            })

    def _coordinate_job(self, job_data: Dict):
        """Coordinate worker processes and handle results."""
        try:
            # Set up communication channels
            result_queue = Queue()
            status_queue = Queue()
            
            # Get row IDs from job data
            row_ids = job_data['row_ids']
            
            # Split work into batches
            batches = [row_ids[i:i + job_data['batch_size']]
                      for i in range(0, len(row_ids), job_data['batch_size'])]
            
            # Launch worker threads
            with ThreadPoolExecutor(max_workers=3) as executor:
                futures = [
                    executor.submit(self._process_batch, batch, job_data, result_queue, status_queue)
                    for batch in batches
                ]
            
            # Initialize tracking
            pending_updates = []
            processed_count = 0
            error_count = 0
            
            # Create fresh client for updates
            from . import SmartsheetOperations
            smartsheet_client = SmartsheetOperations(job_data['api_key']).client
            
            # Wait for all futures to complete
            for future in futures:
                future.result()  # This will raise any exceptions that occurred
            
            # Process all remaining results
            while not result_queue.empty():
                # Handle results
                while not result_queue.empty():
                    result = result_queue.get()
                    if result['status'] == 'success':
                        pending_updates.append({
                            'id': result['row_id'],
                            'cells': [{
                                'columnId': job_data['target_column_id'],
                                'value': result['result']
                            }]
                        })
                        
                        # Batch updates
                        if len(pending_updates) >= 10:
                            try:
                                smartsheet_client.Sheets.update_rows(
                                    job_data['sheet_id'],
                                    pending_updates
                                )
                                pending_updates = []
                            except Exception as e:
                                logger.error(f"Error updating rows: {str(e)}")
                                error_count += len(pending_updates)
                                pending_updates = []
                    
                # Handle status updates
                while not status_queue.empty():
                    status = status_queue.get()
                    if status['type'] == 'progress':
                        processed_count += status['processed']
                    elif status['type'] == 'worker_error':
                        error_count += 1
                    
                    # Update job status
                    self.job_manager.update_job_status(job_data['job_id'], {
                        'processed': processed_count,
                        'errors': error_count,
                        'timestamps': {
                            'updated': datetime.utcnow().isoformat()
                        }
                    })
                
                time.sleep(0.1)  # Prevent busy waiting
                
            # Final updates
            if pending_updates:
                try:
                    smartsheet_client.Sheets.update_rows(
                        job_data['sheet_id'],
                        pending_updates
                    )
                except Exception as e:
                    logger.error(f"Error in final updates: {str(e)}")
                    error_count += len(pending_updates)
            
            # Mark job as completed
            self.job_manager.update_job_status(job_data['job_id'], {
                'status': 'completed',
                'processed': processed_count,
                'errors': error_count,
                'timestamps': {
                    'completed': datetime.utcnow().isoformat()
                }
            })
            
        except Exception as e:
            logger.error(f"Error in job coordination: {str(e)}", exc_info=True)
            self.job_manager.update_job_status(job_data['job_id'], {
                'status': 'failed',
                'error': str(e),
                'timestamps': {
                    'failed': datetime.utcnow().isoformat()
                }
            })

    def _process_rows_in_background(self, job_id: str, row_data_list: List[dict], 
                                  sheet_id: str, target_column: str, 
                                  column_map: dict, api_key: str):
        """Process rows in background using isolated processes."""
        try:
            # Prepare job data
            job_data = {
                'job_id': job_id,
                'sheet_id': sheet_id,
                'api_key': api_key,
                'azure_config': {
                    'endpoint': self.api_base,
                    'api_key': self.api_key,
                    'api_version': self.api_version,
                    'deployment': os.getenv("AZURE_OPENAI_DEPLOYMENT")
                },
                'batch_size': self.batch_size,
                'target_column_id': column_map[target_column],
                'source_column_ids': [str(column_map[col]) for col in row_data_list[0]['template'].get('source_columns', [])],
                'template': row_data_list[0]['template']
            }
            
            # Extract row IDs
            row_ids = [data['row_id'] for data in row_data_list]
            
            # Start job coordination in a thread
            future = self.executor.submit(self._coordinate_job, job_data)
            
            # Store future for potential cancellation
            self.job_manager.active_processes[job_id] = future
            
        except Exception as e:
            logger.error(f"Error starting background processing: {str(e)}", exc_info=True)
            self.job_manager.update_job_status(job_id, {
                'status': 'failed',
                'error': str(e),
                'timestamps': {
                    'failed': datetime.utcnow().isoformat()
                }
            })

    def cancel_analysis(self, job_id: str) -> Dict[str, Any]:
        """Cancel a running analysis job."""
        self.job_manager.cancel_job(job_id)
        return {
            "jobId": job_id,
            "status": "cancelled",
            "message": "Analysis job cancelled",
            "timestamp": datetime.utcnow().isoformat()
        }

    def get_job_status(self, job_id: str, sheet_id: str) -> Dict[str, Any]:
        """Get the status of an analysis job."""
        status = self.job_manager.get_job_status(job_id, sheet_id)
        if not status:
            raise ValueError(f"Job not found: {job_id}")
        return status

# Global batch processor instance
processor = BatchProcessor()
