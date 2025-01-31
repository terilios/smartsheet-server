"""Batch Analysis module for processing Smartsheet data using Azure OpenAI."""

import os
import uuid
import json
import logging
import tiktoken
import pickle
from dotenv import load_dotenv
from pathlib import Path
from openai import AzureOpenAI
import openai

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from root .env file
env_path = Path(__file__).parent.parent.parent / '.env'
logger.info(f"Loading .env from: {env_path}")
logger.info(f"File exists: {env_path.exists()}")
logger.info(f"Absolute path to .env: {env_path.absolute()}")
load_dotenv(env_path, override=True)

# Initialize Azure OpenAI client
client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_API_BASE"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION")
)

# Log all environment variables
logger.info("Environment variables after loading:")
logger.info(f"AZURE_OPENAI_API_KEY present: {bool(os.getenv('AZURE_OPENAI_API_KEY'))}")
logger.info(f"AZURE_OPENAI_API_BASE present: {bool(os.getenv('AZURE_OPENAI_API_BASE'))}")
logger.info(f"AZURE_OPENAI_API_VERSION present: {bool(os.getenv('AZURE_OPENAI_API_VERSION'))}")
logger.info(f"AZURE_OPENAI_DEPLOYMENT present: {bool(os.getenv('AZURE_OPENAI_DEPLOYMENT'))}")
logger.info(f"AZURE_OPENAI_DEPLOYMENT value: {os.getenv('AZURE_OPENAI_DEPLOYMENT')}")

from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
import asyncio
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Jobs storage path
JOBS_DIR = Path(os.path.expanduser("~/.smartsheet_jobs"))
JOBS_DIR.mkdir(exist_ok=True)

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

@dataclass
class JobProgress:
    total: int
    processed: int
    failed: int

@dataclass
class Job:
    id: str
    status: JobStatus
    progress: JobProgress
    timestamps: Dict[str, str]
    error: Optional[str] = None

class BatchProcessor:
    """Manages batch processing of Smartsheet data using Azure OpenAI."""
    
    def __init__(self):
        self.api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.api_base = os.getenv("AZURE_OPENAI_API_BASE")
        self.api_version = os.getenv("AZURE_OPENAI_API_VERSION")
        self.active_jobs: Dict[str, Job] = self._load_jobs()
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

    def _load_jobs(self) -> Dict[str, Job]:
        """Load jobs from disk."""
        jobs = {}
        if JOBS_DIR.exists():
            for job_file in JOBS_DIR.glob("*.job"):
                try:
                    with open(job_file, 'rb') as f:
                        job = pickle.load(f)
                        jobs[job.id] = job
                except Exception as e:
                    logger.error(f"Error loading job {job_file}: {e}")
        return jobs

    def _save_job(self, job: Job):
        """Save job to disk."""
        try:
            job_file = JOBS_DIR / f"{job.id}.job"
            with open(job_file, 'wb') as f:
                pickle.dump(job, f)
        except Exception as e:
            logger.error(f"Error saving job {job.id}: {e}")

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
            
            try:
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
                
            except openai.APIError as e:
                logger.error(f"Azure OpenAI API error: {str(e)}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error in API call: {str(e)}")
                raise
                    
        except Exception as e:
            logger.error(f"Error processing batch: {str(e)}")
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
                logger.error(f"Failed to parse prompt optimization response: {e}")
                raise
        except openai.APIError as e:
            logger.error(f"Azure OpenAI API error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in prompt optimization: {str(e)}")
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
        
        logger.info(f"Processing {len(row_ids)} rows")
        job_id = str(uuid.uuid4())
        
        try:
            # For custom analysis type, generate optimized prompts
            if analysis_type == AnalysisType.CUSTOM:
                if not custom_goal:
                    raise ValueError("Custom goal is required for custom analysis type")
                self.templates[AnalysisType.CUSTOM] = await self._generate_optimized_prompt(custom_goal)

            # Initialize job
            job = Job(
                id=job_id,
                status=JobStatus.QUEUED,
                progress=JobProgress(total=len(row_ids), processed=0, failed=0),
                timestamps={
                    "created": datetime.utcnow().isoformat(),
                    "updated": datetime.utcnow().isoformat()
                }
            )
            self.active_jobs[job_id] = job
            self._save_job(job)
            
            logger.info(f"Created job {job_id}")

            # Start processing in background
            analysis_task = asyncio.create_task(self._run_analysis(
                job_id=job_id,
                sheet_id=sheet_id,
                analysis_type=analysis_type,
                source_columns=source_columns,
                target_column=target_column,
                row_ids=row_ids,
                smartsheet_client=smartsheet_client
            ))
            
            # Add error handling for the background task
            analysis_task.add_done_callback(
                lambda t: logger.error(f"Analysis task failed: {t.exception()}") if t.exception() else None
            )
            
            logger.info(f"Started background processing for job {job_id}")
            
            return {
                "jobId": job_id,
                "analysisType": analysis_type,
                "message": "Analysis job started",
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to start analysis job: {str(e)}")
            if job_id in self.active_jobs:
                self.active_jobs[job_id].status = JobStatus.FAILED
                self.active_jobs[job_id].error = str(e)
                self._save_job(self.active_jobs[job_id])
            raise Exception(f"Failed to start analysis job: {str(e)}")

    async def _run_analysis(self, job_id: str, sheet_id: str,
                          analysis_type: AnalysisType, source_columns: List[str],
                          target_column: str, row_ids: List[str],
                          smartsheet_client: Any) -> None:
        """Run the analysis job in background."""
        job = self.active_jobs[job_id]
        job.status = JobStatus.RUNNING
        self._save_job(job)
        
        try:
            # Get sheet and validate columns
            sheet = smartsheet_client.Sheets.get_sheet(sheet_id)
            column_map = {col.title: col.id for col in sheet.columns}
            
            # Validate columns exist
            for col in source_columns + [target_column]:
                if col not in column_map:
                    raise ValueError(f"Column not found: {col}")

            # Process rows in batches
            batch_size = 50
            for i in range(0, len(row_ids), batch_size):
                if job.status == JobStatus.CANCELLED:
                    return

                batch = row_ids[i:i + batch_size]
                updates = []

                for row_id in batch:
                    try:
                        # Get row data
                        row = next(row for row in sheet.rows if str(row.id) == row_id)
                        
                        # Combine content from source columns
                        content = " ".join(
                            str(cell.value) for cell in row.cells
                            if cell.column_id in [column_map[col] for col in source_columns]
                            and cell.value is not None
                        )

                        # Process content
                        result = await self._process_batch(content, analysis_type)

                        # Prepare update
                        updates.append({
                            "row_id": row_id,
                            "data": {target_column: result}
                        })

                        job.progress.processed += 1
                        self._save_job(job)
                    except Exception as e:
                        job.progress.failed += 1
                        error_msg = f"Error processing row {row_id}: {str(e)}"
                        logger.error(error_msg)
                        job.error = error_msg
                        self._save_job(job)

                # Update rows in batch
                if updates:
                    # Convert updates to format expected by Smartsheet API
                    row_updates = []
                    for update in updates:
                        row_id = update['row_id']
                        data = update['data']
                        cells = []
                        for col_name, value in data.items():
                            cells.append({
                                'columnId': column_map[col_name],
                                'value': value
                            })
                        row_updates.append({
                            'id': row_id,
                            'cells': cells
                        })
                    
                    # Update rows
                    smartsheet_client.Sheets.update_rows(
                        sheet_id,
                        row_updates
                    )

                job.timestamps["updated"] = datetime.utcnow().isoformat()
                self._save_job(job)

            job.status = JobStatus.COMPLETED
            job.timestamps["completed"] = datetime.utcnow().isoformat()
            self._save_job(job)

        except Exception as e:
            job.status = JobStatus.FAILED
            error_msg = f"Job {job_id} failed: {str(e)}"
            job.error = error_msg
            logger.error(error_msg)
            self._save_job(job)

    def cancel_analysis(self, job_id: str) -> Dict[str, Any]:
        """Cancel a running analysis job."""
        if job_id not in self.active_jobs:
            raise ValueError(f"Job not found: {job_id}")

        job = self.active_jobs[job_id]
        if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            raise ValueError(f"Cannot cancel job with status: {job.status}")

        job.status = JobStatus.CANCELLED
        job.timestamps["cancelled"] = datetime.utcnow().isoformat()
        self._save_job(job)

        return {
            "jobId": job_id,
            "status": "cancelled",
            "message": "Analysis job cancelled",
            "timestamp": datetime.utcnow().isoformat()
        }

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get the status of an analysis job."""
        if job_id not in self.active_jobs:
            raise ValueError(f"Job not found: {job_id}")

        job = self.active_jobs[job_id]
        return {
            "jobId": job_id,
            "status": job.status,
            "progress": {
                "total": job.progress.total,
                "processed": job.progress.processed,
                "failed": job.progress.failed
            },
            "timestamps": job.timestamps,
            "error": job.error
        }

# Global batch processor instance
processor = BatchProcessor()
