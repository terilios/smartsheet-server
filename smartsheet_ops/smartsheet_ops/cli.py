#!/usr/bin/env python3
import sys
import json
import argparse
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from . import SmartsheetOperations
from .batch_analysis import processor, AnalysisType

# Load environment variables from root .env file
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path, override=True)

def parse_args():
    parser = argparse.ArgumentParser(description='Smartsheet Operations CLI')
    parser.add_argument('--api-key', required=True, help='Smartsheet API key')
    parser.add_argument('--operation', required=True, 
                       choices=['get_column_map', 'add_rows', 'check_duplicate', 'update_rows', 'delete_rows', 'search', 'get_all_row_ids',
                               'add_column', 'delete_column', 'rename_column', 'bulk_update',
                               'start_analysis', 'cancel_analysis', 'get_job_status',
                               'list_workspaces', 'get_workspace', 'create_workspace',
                               'create_sheet_in_workspace', 'list_workspace_sheets'], 
                       help='Operation to perform')
    parser.add_argument('--sheet-id', help='Smartsheet sheet ID')
    parser.add_argument('--workspace-id', help='Smartsheet workspace ID')
    parser.add_argument('--data', help='JSON data for operations')
    return parser.parse_args()

def check_for_duplicate(ops, sheet_id, new_row_data):
    """Check if a record with the same data exists"""
    # Get the sheet info to get current data
    sheet_info = ops.get_sheet_info(sheet_id)
    
    # Get the sample data which contains existing rows
    existing_rows = sheet_info.get('sample_data', [])
    
    # For each existing row, compare the values that exist in new_row_data
    for existing_row in existing_rows:
        matches = 0
        total_fields = 0
        
        for field, value in new_row_data.items():
            if field in existing_row:
                total_fields += 1
                if existing_row[field] == value:
                    matches += 1
        
        # If we have matches for all fields that exist in both rows
        if total_fields > 0 and matches == total_fields:
            return True
            
    return False

async def main():
    try:
        args = parse_args()
        
        # Initialize Smartsheet operations
        ops = SmartsheetOperations(args.api_key)
        
        # Perform requested operation
        if args.operation == 'get_column_map':
            result = ops.get_sheet_info(args.sheet_id)
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'check_duplicate':
            if not args.data:
                raise ValueError("--data is required for check_duplicate operation")
            data = json.loads(args.data)
            is_duplicate = check_for_duplicate(ops, args.sheet_id, data)
            print(json.dumps({
                "duplicate": is_duplicate,
                "operation": "check_duplicate"
            }, indent=2))
            
        elif args.operation == 'add_rows':
            if not args.data:
                raise ValueError("--data is required for add_rows operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'row_data' not in data or 'column_map' not in data:
                raise ValueError("Invalid data format. Expected: {'row_data': [...], 'column_map': {...}}")
            
            # Check for duplicates before adding
            for row in data['row_data']:
                if check_for_duplicate(ops, args.sheet_id, row):
                    print(json.dumps({
                        "message": "Duplicate record found - skipping addition",
                        "operation": "add_rows"
                    }, indent=2))
                    return
                    
            result = ops.add_rows(args.sheet_id, data['row_data'], data['column_map'])
            # Get the sheet to get the row IDs
            sheet = ops.client.Sheets.get_sheet(args.sheet_id)
            # Find our newly added rows (they'll be at the top since we use to_top=True)
            new_row_ids = [str(row.id) for row in sheet.rows[:len(data['row_data'])]]
            result['row_ids'] = new_row_ids
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'update_rows':
            if not args.data:
                raise ValueError("--data is required for update_rows operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'updates' not in data or 'column_map' not in data:
                raise ValueError("Invalid data format. Expected: {'updates': [...], 'column_map': {...}}")
            
            result = ops.update_rows(args.sheet_id, data['updates'], data['column_map'])
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'delete_rows':
            if not args.data:
                raise ValueError("--data is required for delete_rows operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'row_ids' not in data:
                raise ValueError("Invalid data format. Expected: {'row_ids': [...]}")
            
            result = ops.delete_rows(args.sheet_id, data['row_ids'])
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'search':
            if not args.data:
                raise ValueError("--data is required for search operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'pattern' not in data:
                raise ValueError("Invalid data format. Expected: {'pattern': str, 'options': {...}}")
            
            result = ops.search_sheet(
                args.sheet_id,
                data['pattern'],
                data.get('options')
            )
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'add_column':
            if not args.data:
                raise ValueError("--data is required for add_column operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'title' not in data or 'type' not in data:
                raise ValueError("Invalid data format. Expected: {'title': str, 'type': str, ...}")
            
            result = ops.add_column(args.sheet_id, data)
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'delete_column':
            if not args.data:
                raise ValueError("--data is required for delete_column operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'column_id' not in data:
                raise ValueError("Invalid data format. Expected: {'column_id': str, 'validate_dependencies': bool}")
            
            result = ops.delete_column(
                args.sheet_id,
                data['column_id'],
                data.get('validate_dependencies', True)
            )
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'rename_column':
            if not args.data:
                raise ValueError("--data is required for rename_column operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'column_id' not in data or 'new_title' not in data:
                raise ValueError("Invalid data format. Expected: {'column_id': str, 'new_title': str, 'update_references': bool}")
            
            result = ops.rename_column(
                args.sheet_id,
                data['column_id'],
                data['new_title'],
                data.get('update_references', True)
            )
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'bulk_update':
            if not args.data:
                raise ValueError("--data is required for bulk_update operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'rules' not in data:
                raise ValueError("Invalid data format. Expected: {'rules': [...], 'options': {...}}")
            
            result = ops.bulk_update(
                args.sheet_id,
                data['rules'],
                data.get('options', {})
            )
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'get_all_row_ids':
            # Fetch all row IDs from the specified sheet
            sheet = ops.client.Sheets.get_sheet(args.sheet_id)
            row_ids = [str(row.id) for row in sheet.rows]
            result = {
                "operation": "get_all_row_ids",
                "row_ids": row_ids
            }
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'start_analysis':
            if not args.data:
                raise ValueError("--data is required for start_analysis operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'type' not in data or 'sourceColumns' not in data or 'targetColumn' not in data:
                raise ValueError("Invalid data format. Expected: {'type': str, 'sourceColumns': [...], 'targetColumn': str, 'rowIds': [...], 'customGoal': str?}")
            
            result = await processor.start_analysis(
                args.sheet_id,
                AnalysisType(data['type']),
                data['sourceColumns'],
                data['targetColumn'],
                data.get('rowIds'),
                ops.client,
                data.get('customGoal')
            )
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'cancel_analysis':
            if not args.data:
                raise ValueError("--data is required for cancel_analysis operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'jobId' not in data:
                raise ValueError("Invalid data format. Expected: {'jobId': str}")
            
            result = processor.cancel_analysis(data['jobId'])
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'get_job_status':
            if not args.data:
                raise ValueError("--data is required for get_job_status operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'jobId' not in data:
                raise ValueError("Invalid data format. Expected: {'jobId': str}")
            
            result = processor.get_job_status(data['jobId'], args.sheet_id)
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'list_workspaces':
            result = ops.list_workspaces()
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'get_workspace':
            if not args.workspace_id:
                raise ValueError("--workspace-id is required for get_workspace operation")
            result = ops.get_workspace(args.workspace_id)
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'create_workspace':
            if not args.data:
                raise ValueError("--data is required for create_workspace operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'name' not in data:
                raise ValueError("Invalid data format. Expected: {'name': str}")
            result = ops.create_workspace(data['name'])
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'create_sheet_in_workspace':
            if not args.workspace_id:
                raise ValueError("--workspace-id is required for create_sheet_in_workspace operation")
            if not args.data:
                raise ValueError("--data is required for create_sheet_in_workspace operation")
            data = json.loads(args.data)
            if not isinstance(data, dict) or 'name' not in data or 'columns' not in data:
                raise ValueError("Invalid data format. Expected: {'name': str, 'columns': [...]}")
            result = ops.create_sheet_in_workspace(args.workspace_id, data)
            print(json.dumps(result, indent=2))
            
        elif args.operation == 'list_workspace_sheets':
            if not args.workspace_id:
                raise ValueError("--workspace-id is required for list_workspace_sheets operation")
            result = ops.list_workspace_sheets(args.workspace_id)
            print(json.dumps(result, indent=2))
        
    except Exception as e:
        error = {
            "error": True,
            "message": str(e),
            "type": type(e).__name__
        }
        print(json.dumps(error, indent=2), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    import multiprocessing
    multiprocessing.freeze_support()
    asyncio.run(main())
