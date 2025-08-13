import smartsheet
import json
import re
import logging
from typing import Dict, List, Optional, Any, Tuple, Union

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# System column types in their exact API form
SYSTEM_COLUMN_TYPES = {
    'AUTO_NUMBER',   # For auto-numbered columns
    'CREATED_DATE',  # For creation timestamp
    'MODIFIED_DATE', # For last modified timestamp
    'CREATED_BY',    # For creator info
    'MODIFIED_BY',   # For last modifier info
    'FORMULA'        # For formula columns
}

# Project plan specific column types
PROJECT_COLUMN_TYPES = {
    'DURATION',           # Task duration
    'ABSTRACT_DATETIME',  # Start/Finish dates in project plans
    'PREDECESSOR',        # Task dependencies
    'CONTACT_LIST',       # Resource assignments
    'PICKLIST',          # Status dropdowns
    'DATETIME'           # Standard date/time columns
}

# Multi-value column types
MULTI_VALUE_COLUMN_TYPES = {
    'MULTI_CONTACT_LIST', # Multiple contact assignments
    'MULTI_PICKLIST'      # Multiple selections from picklist
}

# All recognized column types (for validation)
ALL_COLUMN_TYPES = SYSTEM_COLUMN_TYPES | PROJECT_COLUMN_TYPES | MULTI_VALUE_COLUMN_TYPES | {
    'TEXT_NUMBER',       # Standard text/number
    'DATE',             # Standard date
    'CHECKBOX'          # Checkbox columns
}

class SmartsheetOperations:
    def __init__(self, api_key: str):
        """Initialize SmartsheetOperations with proper error handling."""
        if not api_key:
            raise ValueError("API key is required and cannot be empty")
        
        if not isinstance(api_key, str):
            raise ValueError("API key must be a string")
        
        try:
            logger.info("Initializing Smartsheet client")
            self.client = smartsheet.Smartsheet(api_key)
            self.client.errors_as_exceptions(True)
            logger.info("Smartsheet client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Smartsheet client: {e}", exc_info=True)
            raise RuntimeError(f"Failed to initialize Smartsheet client: {str(e)}")

    def _normalize_column_type(self, value: Optional[str]) -> Optional[str]:
        """Normalize column type for system type detection."""
        if not value or value.lower() == 'none':
            return None
        return value.strip()  # API values are already in correct case

    def _process_auto_number_config(self, column: Any, info: Dict[str, Any]) -> None:
        """Process auto-number configuration if present."""
        format_attrs = ['auto_number_format', '_auto_number_format']
        for attr in format_attrs:
            if hasattr(column, attr):
                try:
                    auto_number_format = str(getattr(column, attr))
                    if auto_number_format and auto_number_format.lower() != 'none':
                        config = json.loads(auto_number_format)
                        info["auto_number"] = {
                            "prefix": config.get("prefix", ""),
                            "fill": config.get("fill", ""),
                            "suffix": config.get("suffix", "")
                        }
                except (json.JSONDecodeError, AttributeError):
                    info["auto_number"] = {"error": "Invalid format"}
                break

    def _process_picklist_options(self, column: Any, info: Dict[str, Any]) -> None:
        """Process picklist options if present."""
        try:
            if hasattr(column, '_options'):
                info["options"] = [str(opt) for opt in column._options]
            elif hasattr(column, 'options'):
                info["options"] = [str(opt) for opt in column.options]
        except:
            pass

    def _add_metadata(self, column: Any, info: Dict[str, Any]) -> None:
        """Add validation and format metadata."""
        if hasattr(column, '_validation'):
            info["validation"] = str(column._validation)
        elif hasattr(column, 'validation'):
            info["validation"] = str(column.validation)
            
        if hasattr(column, '_format_'):
            info["format"] = str(column._format_)
        elif hasattr(column, 'format'):
            info["format"] = str(column.format)

    def _parse_formula_dependencies(self, formula: str) -> List[str]:
        """Extract column references from a formula string."""
        import re
        return list(set(re.findall(r'\[([^\]]+)\]', formula)))

    def get_column_info(self, column: Any) -> Dict[str, Any]:
        """
        Extract column information safely.
        Distinguish base column types from system-managed or formula-based columns.
        Enhanced to properly detect project plan column types.
        """
        info = {
            "id": str(column.id_),
            "type": "TEXT_NUMBER",  # Default final/effective type
            "system_managed": False,
            "project_column": False,  # New flag for project-specific columns
            "debug": {}
        }
        
        try:
            # Collect raw debug info
            debug_attrs = [
                '_type_', '_system_column_type', 'system_column_type',
                'auto_number_format', '_auto_number_format',
                '_validation', 'validation',
                '_format_', 'format',
                'formula', '_formula'
            ]
            for attr in debug_attrs:
                if hasattr(column, attr):
                    info["debug"][attr] = str(getattr(column, attr))

            # 1) Detect system column type first (highest priority)
            system_type = None
            system_managed = False
            for attr in ['_system_column_type', 'system_column_type']:
                if hasattr(column, attr):
                    raw_value = str(getattr(column, attr))
                    normalized = self._normalize_column_type(raw_value)
                    if normalized and normalized in SYSTEM_COLUMN_TYPES:
                        info["system_column_type"] = raw_value
                        info["type"] = normalized  # Use normalized value for type
                        system_type = normalized
                        system_managed = True

                        if normalized == 'AUTO_NUMBER':
                            self._process_auto_number_config(column, info)
                        elif normalized in ['CREATED_DATE', 'MODIFIED_DATE']:
                            info["format_type"] = "system_datetime"
                        # Stop if system type is found
                        break

            # 2) If not a system column, get column type from debug info
            if not system_managed and '_type_' in info["debug"]:
                raw_type = info["debug"]['_type_']
                if raw_type and raw_type.lower() != 'none':
                    detected_type = raw_type.strip()
                    
                    # Check if it's a project plan specific type
                    if detected_type in PROJECT_COLUMN_TYPES:
                        info["type"] = detected_type
                        info["project_column"] = True
                        
                        # Handle special project column types
                        if detected_type == "PICKLIST":
                            self._process_picklist_options(column, info)
                        elif detected_type == "CONTACT_LIST":
                            info["supports_multiple"] = True
                        elif detected_type == "DURATION":
                            info["format_type"] = "duration"
                        elif detected_type in ["ABSTRACT_DATETIME", "DATETIME"]:
                            info["format_type"] = "datetime"
                        elif detected_type == "PREDECESSOR":
                            info["format_type"] = "predecessor"
                            info["supports_dependencies"] = True
                    elif detected_type in MULTI_VALUE_COLUMN_TYPES:
                        info["type"] = detected_type
                        info["multi_value"] = True
                        
                        # Handle multi-value column types
                        if detected_type == "MULTI_PICKLIST":
                            self._process_picklist_options(column, info)
                            info["supports_multiple_selections"] = True
                        elif detected_type == "MULTI_CONTACT_LIST":
                            info["supports_multiple_contacts"] = True
                    else:
                        # Standard column type
                        info["type"] = detected_type
                        if detected_type == "PICKLIST":
                            self._process_picklist_options(column, info)

            # 3) If no system column type found, check for a formula
            if not system_type and not info["project_column"]:
                for attr in ['formula', '_formula']:
                    if hasattr(column, attr):
                        formula_val = str(getattr(column, attr))
                        if formula_val and formula_val.lower() != 'none':
                            info["formula"] = formula_val
                            info["dependencies"] = self._parse_formula_dependencies(formula_val)
                            info["type"] = "FORMULA"  # effective type is formula
                            system_managed = True
                            system_type = "FORMULA"
                            break

            # Set final system_managed flag
            info["system_managed"] = system_managed
            
            # If final type has a period in it, strip leading qualifiers (e.g., SomeNamespace.TYPE)
            if '.' in info["type"]:
                info["type"] = info["type"].split('.')[-1]
            
            # 4) Handle picklist options if it's a picklist (for both project and standard)
            if info["type"] == "PICKLIST":
                self._process_picklist_options(column, info)

            # 5) Add validation and format metadata
            self._add_metadata(column, info)

            # 6) Add project-specific metadata
            if info["project_column"]:
                info["category"] = "project_management"
                
                # Add type-specific guidance
                if info["type"] == "DURATION":
                    info["usage_notes"] = "Use format like '5d', '2w', '3h' for duration values"
                elif info["type"] == "ABSTRACT_DATETIME":
                    info["usage_notes"] = "Use ISO format dates for start/finish times"
                elif info["type"] == "PREDECESSOR":
                    info["usage_notes"] = "Reference other task row numbers (e.g., '1', '2,3', '1FS+2d')"
                elif info["type"] == "CONTACT_LIST":
                    info["usage_notes"] = "Assign users by email or name"

        except Exception:
            # If something goes wrong, we simply return what we have so far
            pass
            
        return info

    def get_sheet_info(self, sheet_id: str) -> Dict[str, Any]:
        """Get sheet information including columns and sample data."""
        logger.info(f"Getting sheet info for sheet ID: {sheet_id}")
        
        # Input validation
        if not sheet_id or not isinstance(sheet_id, str):
            error_msg = f"Invalid sheet_id provided: {sheet_id}"
            logger.error(error_msg)
            return {"error": error_msg}
        
        try:
            # Get the sheet with level parameter for complex column types
            logger.debug(f"Fetching sheet data from Smartsheet API")
            sheet = self.client.Sheets.get_sheet(
                sheet_id,
                level=2,
                include='objectValue'
            )
            
            # Validate sheet response
            if not sheet:
                error_msg = f"Sheet not found or access denied for sheet ID: {sheet_id}"
                logger.error(error_msg)
                return {"error": error_msg}
            
            # Get columns with proper error handling
            columns = getattr(sheet, 'columns', None)
            if not columns:
                logger.warning(f"No columns found for sheet {sheet_id}")
                return {
                    "success": True,
                    "sheet_id": sheet_id,
                    "column_map": {},
                    "column_info": {},
                    "sample_data": [],
                    "usage_example": {"column_map": {}, "row_data": []}
                }
            
            column_map = {}
            column_info = {}
            
            # First pass: Map column titles to IDs
            try:
                for col in columns:
                    try:
                        col_title = getattr(col, 'title', None)
                        col_id = getattr(col, 'id_', getattr(col, 'id', None))
                        
                        if col_title and col_id:
                            column_map[col_title] = str(col_id)
                        else:
                            logger.warning(f"Skipping column with missing title or id: title={col_title}, id={col_id}")
                    except Exception as col_error:
                        logger.warning(f"Error processing column: {col_error}")
                        continue
            except Exception as e:
                logger.error(f"Error iterating over columns: {e}")
                return {"error": f"Failed to process sheet columns: {str(e)}"}
            
            # Second pass: Gather detailed info for each column
            for col in columns:
                try:
                    col_title = getattr(col, 'title', None)
                    if col_title and col_title in column_map:
                        try:
                            column_info[col_title] = self.get_column_info(col)
                        except Exception as info_error:
                            logger.warning(f"Error getting column info for {col_title}: {info_error}")
                            # Fallback to minimal info
                            column_info[col_title] = {
                                "id": column_map[col_title],
                                "type": "TEXT_NUMBER"
                            }
                except Exception as col_error:
                    logger.warning(f"Error processing column details: {col_error}")
                    continue
            
            # Gather up to 5 rows of sample data
            sample_data = []
            try:
                rows = getattr(sheet, 'rows', [])
                for i, row in enumerate(rows):
                    if i >= 5:
                        break
                    
                    try:
                        row_id = getattr(row, 'id', None)
                        row_data = {"__id": str(row_id) if row_id else f"row_{i}"}
                        
                        cells = getattr(row, 'cells', [])
                        for cell in cells:
                            try:
                                cell_column_id = getattr(cell, 'column_id', None)
                                cell_value = getattr(cell, 'value', None)
                                
                                # Find the column title for this cell
                                for col in columns:
                                    col_id = getattr(col, 'id_', getattr(col, 'id', None))
                                    col_title = getattr(col, 'title', None)
                                    
                                    if col_id and str(col_id) == str(cell_column_id):
                                        row_data[col_title] = cell_value
                                        break
                            except Exception as cell_error:
                                logger.warning(f"Error processing cell: {cell_error}")
                                continue
                        
                        sample_data.append(row_data)
                    except Exception as row_error:
                        logger.warning(f"Error processing row {i}: {row_error}")
                        continue
            except Exception as rows_error:
                logger.warning(f"Error processing rows: {rows_error}")
            
            # Create an example row using the column_map
            example_row = {}
            for title in column_map.keys():
                example_row[title] = "sample_value"
            
            # Prepare successful response
            result = {
                "success": True,
                "sheet_id": sheet_id,
                "column_map": column_map,
                "column_info": column_info,
                "sample_data": sample_data,
                "usage_example": {
                    "column_map": column_map,
                    "row_data": [example_row]
                }
            }
            
            logger.info(f"Successfully retrieved sheet info for {sheet_id}: {len(column_map)} columns, {len(sample_data)} sample rows")
            return result
            
        except Exception as e:
            error_msg = f"Failed to get sheet info for {sheet_id}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {"error": error_msg}

    def _create_cell(self, column_id: int, value: Any, column_info: Dict) -> smartsheet.models.Cell:
        """Create a cell with proper handling of multi-select picklist values."""
        cell = smartsheet.models.Cell()
        cell.column_id = column_id
        
        if isinstance(value, list) and value:
            # For multi-select values, only use object_value
            cell.object_value = {
                'objectType': 'MULTI_PICKLIST',
                'values': value
            }
        else:
            # For single values
            cell.value = value
        
        return cell

    def add_rows(self, sheet_id: str, row_data: List[Dict[str, Any]], column_map: Dict[str, str]) -> Dict[str, Any]:
        """Add rows to a sheet with optional hierarchy support. Skips system-managed columns."""
        try:
            # Retrieve sheet info to identify system-managed columns
            sheet_info = self.get_sheet_info(sheet_id)
            column_info = sheet_info.get('column_info', {})
            
            # Prepare new row models
            new_rows = []
            for data in row_data:
                new_row = smartsheet.models.Row()
                
                # Handle hierarchy and positioning attributes
                # Map camelCase API names to Python SDK attribute names
                hierarchy_mapping = {
                    'parentId': 'parent_id',
                    'toTop': 'to_top', 
                    'toBottom': 'to_bottom',
                    'above': 'above',
                    'below': 'below',
                    'siblingId': 'sibling_id'
                }
                has_positioning = False
                
                for api_attr, sdk_attr in hierarchy_mapping.items():
                    if api_attr in data:
                        value = data[api_attr]
                        # Convert parent_id to integer if it's a string
                        if sdk_attr == 'parent_id' and isinstance(value, str):
                            value = int(value)
                        setattr(new_row, sdk_attr, value)
                        has_positioning = True
                
                # If no positioning specified, default to bottom
                if not has_positioning:
                    new_row.to_bottom = True
                
                # Process regular cell data
                cells = []
                for field, value in data.items():
                    # Skip hierarchy attributes and system-managed columns
                    if field in hierarchy_mapping:
                        continue
                    if field in column_info and column_info[field].get('system_managed', False):
                        continue
                    
                    if field in column_map:
                        column_id = int(column_map[field])
                        cell = self._create_cell(
                            column_id,
                            value,
                            column_info.get(field, {})
                        )
                        cells.append(cell)
                
                new_row.cells = cells
                new_rows.append(new_row)
            
            # Add the rows
            result = self.client.Sheets.add_rows(sheet_id, new_rows)
            
            # Gather row IDs
            row_ids = []
            if isinstance(result, list):
                for row_resp in result:
                    if hasattr(row_resp, 'id'):
                        row_ids.append(str(row_resp.id))
            
            return {
                "message": "Successfully added rows",
                "rows_added": len(new_rows),
                "row_ids": row_ids
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to add rows: {str(e)}")

    def add_hierarchical_rows(
        self, 
        sheet_id: str, 
        hierarchical_data: List[Dict[str, Any]], 
        column_map: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        Add rows with hierarchical structure in a single operation.
        
        Args:
            sheet_id: Smartsheet sheet ID
            hierarchical_data: List of row data with hierarchy information
                Each row can contain:
                - Regular column data (mapped via column_map)
                - parentId: ID of parent row (for indentation)
                - toTop/toBottom: Position within level
                - siblingId + above/below: Position relative to sibling
            column_map: Mapping of field names to column IDs
            
        Returns:
            Dict containing success message and created row information with hierarchy
            
        Example hierarchical_data:
            [
                {
                    "Task Name": "Phase 1: Planning",
                    "Duration": "0",
                    "toTop": True
                },
                {
                    "Task Name": "Requirements Gathering", 
                    "Duration": "5d",
                    "parentId": "<parent_row_id>",  # Will be set after parent is created
                    "toTop": True
                },
                {
                    "Task Name": "Stakeholder Interviews",
                    "Duration": "3d", 
                    "parentId": "<requirements_row_id>",  # Will be set after requirements is created
                    "toTop": True
                }
            ]
        """
        try:
            # This method creates rows in order, allowing parent IDs to be set
            # as we create each level of the hierarchy
            created_rows = []
            row_id_map = {}  # Track created row IDs for parent references
            
            for i, data in enumerate(hierarchical_data):
                # Create a single row
                result = self.add_rows(sheet_id, [data], column_map)
                
                if result.get('row_ids'):
                    row_id = result['row_ids'][0]
                    created_rows.append({
                        'index': i,
                        'row_id': row_id,
                        'task_name': data.get('Task Name', f'Row {i+1}')
                    })
                    row_id_map[i] = row_id
            
            return {
                "message": "Successfully added hierarchical rows",
                "rows_added": len(created_rows),
                "created_rows": created_rows,
                "row_id_map": row_id_map
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to add hierarchical rows: {str(e)}")

    def update_rows(
        self,
        sheet_id: str,
        updates: List[Dict[str, Any]],
        column_map: Dict[str, str]
    ) -> Dict[str, Any]:
        """
        Update existing rows in a sheet.

        Args:
            sheet_id: Smartsheet sheet ID
            updates: List of updates containing row_id and data
            column_map: Mapping of field names to column IDs

        Returns:
            Dict containing success message and updated row information

        Raises:
            RuntimeError: If update fails
        """
        try:
            # Get sheet info for validation
            sheet_info = self.get_sheet_info(sheet_id)
            column_info = sheet_info.get('column_info', {})

            # Validate row IDs and prepare updates
            valid_updates = []
            validation_errors = []

            for update in updates:
                if not isinstance(update, dict) or 'row_id' not in update or 'data' not in update:
                    validation_errors.append({
                        'error': 'Invalid update format',
                        'update': update
                    })
                    continue

                # Validate update data
                is_valid, error = self._validate_update_data(update['data'], column_info)
                if not is_valid:
                    validation_errors.append({
                        'row_id': update['row_id'],
                        'error': error
                    })
                    continue

                valid_updates.append(update)

            if not valid_updates:
                return {
                    'message': 'No valid updates to process',
                    'rows_updated': 0,
                    'validation_errors': validation_errors
                }

            # Prepare row models for update
            update_rows = []
            for update in valid_updates:
                row = self._prepare_update_row(
                    update['row_id'],
                    update['data'],
                    column_map,
                    column_info
                )
                update_rows.append(row)

            # Perform updates
            result = self.client.Sheets.update_rows(sheet_id, update_rows)

            # Process results
            row_ids = []
            if isinstance(result, list):
                for row_resp in result:
                    if hasattr(row_resp, 'id'):
                        row_ids.append(str(row_resp.id))

            response = {
                'message': 'Successfully updated rows',
                'rows_updated': len(row_ids),
                'row_ids': row_ids
            }

            if validation_errors:
                response['validation_errors'] = validation_errors

            return response

        except Exception as e:
            raise RuntimeError(f"Failed to update rows: {str(e)}")

    def delete_rows(
        self,
        sheet_id: str,
        row_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Delete rows from a sheet.

        Args:
            sheet_id: Smartsheet sheet ID
            row_ids: List of row IDs to delete

        Returns:
            Dict containing success message and deletion details

        Raises:
            RuntimeError: If deletion fails
        """
        try:
            # Validate row IDs
            valid_ids, errors = self._validate_row_ids(sheet_id, row_ids)

            if not valid_ids:
                return {
                    'message': 'No valid rows to delete',
                    'rows_deleted': 0,
                    'failed_deletes': errors
                }

            # Perform deletion
            self.client.Sheets.delete_rows(sheet_id, valid_ids)

            response = {
                'message': 'Successfully deleted rows',
                'rows_deleted': len(valid_ids)
            }

            if errors:
                response['failed_deletes'] = errors

            return response

        except Exception as e:
            raise RuntimeError(f"Failed to delete rows: {str(e)}")

    def _validate_update_data(
        self,
        data: Dict[str, Any],
        column_info: Dict[str, Any]
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate update data against column types.

        Args:
            data: Update data to validate
            column_info: Column information from get_sheet_info

        Returns:
            Tuple of (is_valid: bool, error_message: Optional[str])
        """
        try:
            for field, value in data.items():
                if field not in column_info:
                    return False, f"Unknown field: {field}"

                field_info = column_info[field]

                # Skip validation for system-managed columns
                if field_info.get('system_managed', False):
                    return False, f"Cannot update system-managed field: {field}"

                # Validate multi-select fields
                if field_info.get('type') == 'PICKLIST' and isinstance(value, list):
                    options = field_info.get('options', [])
                    for item in value:
                        if str(item) not in options:
                            return False, f"Invalid option '{item}' for field: {field}"

            return True, None

        except Exception as e:
            return False, f"Validation error: {str(e)}"

    def _prepare_update_row(
        self,
        row_id: str,
        data: Dict[str, Any],
        column_map: Dict[str, str],
        column_info: Dict[str, Any]
    ) -> smartsheet.models.Row:
        """
        Prepare a row model for update.

        Args:
            row_id: Row ID to update
            data: Update data
            column_map: Column mapping
            column_info: Column information

        Returns:
            Configured Row model ready for update
        """
        new_row = smartsheet.models.Row()
        new_row.id_ = int(row_id)

        cells = []
        for field, value in data.items():
            # Skip system-managed columns
            if field in column_info and column_info[field].get('system_managed', False):
                continue

            if field in column_map:
                column_id = int(column_map[field])
                cell = self._create_cell(
                    column_id,
                    value,
                    column_info.get(field, {})
                )
                cells.append(cell)

        new_row.cells = cells
        return new_row

    def search_sheet(
        self,
        sheet_id: str,
        pattern: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Search a sheet using a pattern.
        
        Args:
            sheet_id: Smartsheet sheet ID
            pattern: Search pattern (text/regex)
            options: Optional search configuration
                {
                    'columns': List[str] | None,  # Specific columns to search, or None for all
                    'case_sensitive': bool,       # Case sensitive search
                    'regex': bool,                # Use regex pattern matching
                    'whole_word': bool,           # Match whole words only
                    'include_system': bool        # Include system-managed columns
                }
        
        Returns:
            Dict containing matches and metadata
        """
        try:
            # Get sheet info for column details
            sheet_info = self.get_sheet_info(sheet_id)
            column_info = sheet_info.get('column_info', {})
            
            # Process options
            options = options or {}
            columns_to_search = options.get('columns')
            case_sensitive = options.get('case_sensitive', False)
            use_regex = options.get('regex', False)
            whole_word = options.get('whole_word', False)
            include_system = options.get('include_system', False)
            
            # Get the sheet with all rows
            sheet = self.client.Sheets.get_sheet(sheet_id)
            
            # Prepare pattern
            if not use_regex:
                pattern = re.escape(pattern)
            if whole_word:
                pattern = fr'\b{pattern}\b'
            flags = 0 if case_sensitive else re.IGNORECASE
            pattern_re = re.compile(pattern, flags)
            
            # Track matches
            matches = []
            columns_searched = set()
            
            # Search each row
            for row in sheet.rows:
                row_matches = []
                
                for cell in row.cells:
                    # Find column info
                    column_title = None
                    column_type = None
                    for title, info in column_info.items():
                        if str(info['id']) == str(cell.column_id):
                            column_title = title
                            column_type = info.get('type')
                            break
                    
                    if not column_title:
                        continue
                        
                    # Check if we should search this column
                    if columns_to_search and column_title not in columns_to_search:
                        continue
                        
                    # Skip system columns if not included
                    if not include_system and column_info.get(column_title, {}).get('system_managed', False):
                        continue
                    
                    columns_searched.add(column_title)
                    
                    # Get cell value
                    value = cell.value
                    if value is None:
                        continue
                    
                    # For PICKLIST columns, do exact value comparison
                    if column_type == "PICKLIST":
                        if str(value) == pattern:
                            matches_found = [type('Match', (), {'group': lambda x: value, 'start': lambda: 0, 'end': lambda: len(str(value))})]
                        else:
                            matches_found = []
                    else:
                        # For other columns, use regex search
                        str_value = str(value)
                        matches_found = list(pattern_re.finditer(str_value))
                    if matches_found:
                        for match in matches_found:
                            row_matches.append({
                                'column': column_title,
                                'value': value,
                                'matched_text': match.group(0),
                                'context': {
                                    'before': str_value[:match.start()],
                                    'after': str_value[match.end():]
                                }
                            })
                
                if row_matches:
                    matches.append({
                        'row_id': str(row.id),
                        'matches': row_matches
                    })
            
            # Extract row IDs from matches
            matched_row_ids = [match['row_id'] for match in matches]
            
            return {
                'row_ids': matched_row_ids,  # Primary result - list of matching row IDs
                'matches': matches,  # Detailed match information
                'metadata': {
                    'sheet_info': {
                        'total_rows': len(sheet.rows),
                        'total_columns': len(sheet.columns),
                        'column_types': {
                            title: info.get('type', 'TEXT_NUMBER')
                            for title, info in column_info.items()
                        }
                    },
                    'search_info': {
                        'matched_rows': len(matches),
                        'columns_searched': sorted(list(columns_searched)),
                        'pattern_used': pattern
                    }
                }
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to search sheet: {str(e)}")

    def add_column(
        self,
        sheet_id: str,
        column_options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Add a new column to a sheet.

        Args:
            sheet_id: Smartsheet sheet ID
            column_options: Column configuration
                {
                    'title': str,
                    'type': "TEXT_NUMBER" | "DATE" | "CHECKBOX" | "PICKLIST" | "CONTACT_LIST",
                    'index': Optional[int],
                    'validation': Optional[bool],
                    'formula': Optional[str],
                    'options': Optional[List[str]]  # For PICKLIST type
                }

        Returns:
            Dict containing success message and column information
        """
        try:
            # Get current sheet info to validate column count
            sheet = self.client.Sheets.get_sheet(sheet_id)
            if len(sheet.columns) >= 400:
                raise ValueError("Maximum column limit (400) reached")

            # Create column object
            column = smartsheet.models.Column({
                'title': column_options['title'],
                'type': column_options['type'],
                'index': column_options.get('index'),
                'validation': column_options.get('validation'),
                'formula': column_options.get('formula')
            })

            # Add options for PICKLIST type
            if column_options['type'] == 'PICKLIST' and 'options' in column_options:
                column.options = column_options['options']

            # Add the column
            result = self.client.Sheets.add_columns(sheet_id, [column])

            # Get the new column info
            if isinstance(result, list) and result:
                new_column = result[0]
                try:
                    column_info = self.get_column_info(new_column)
                    success_response = {
                        "success": True,
                        "message": "Successfully added column",
                        "column": column_info
                    }
                    
                    # Check for validation warnings
                    if column_options.get('index') is not None:
                        success_response["warnings"] = [{
                            "type": "validation",
                            "message": "Column index validation warning - column was added successfully but index may have been adjusted"
                        }]
                    return success_response
                except Exception as e:
                    # If we fail to get column info but the column was added, return success with warning
                    return {
                        "success": True,
                        "message": "Successfully added column",
                        "column_id": str(new_column.id_) if hasattr(new_column, 'id_') else None,
                        "warnings": [{
                            "type": "info",
                            "message": "Column added but detailed info unavailable"
                        }]
                    }
            else:
                # If we get here, the column wasn't added
                return {
                    "success": False,
                    "message": "Failed to add column",
                    "error": "No column data returned from API"
                }

        except Exception as e:
            return {
                "success": False,
                "message": "Failed to add column",
                "error": str(e)
            }

    def delete_column(
        self,
        sheet_id: str,
        column_id: str,
        validate_dependencies: bool = True
    ) -> Dict[str, Any]:
        """
        Delete a column from a sheet.

        Args:
            sheet_id: Smartsheet sheet ID
            column_id: Column ID to delete
            validate_dependencies: Check for formula/dependency impacts

        Returns:
            Dict containing success message and deletion details
        """
        try:
            if validate_dependencies:
                # Get sheet info to check dependencies
                sheet_info = self.get_sheet_info(sheet_id)
                dependencies = []

                # Check each column for formulas that reference this column
                for col_name, col_info in sheet_info['column_info'].items():
                    if col_info.get('type') == 'FORMULA':
                        formula = col_info.get('formula', '')
                        if f'[{column_id}]' in formula:
                            dependencies.append({
                                'column': col_name,
                                'type': 'formula_reference'
                            })

                if dependencies:
                    return {
                        "message": "Cannot delete column due to dependencies",
                        "dependencies": dependencies
                    }

            # Delete the column
            self.client.Sheets.delete_column(sheet_id, column_id)

            return {
                "message": "Successfully deleted column",
                "column_id": column_id
            }

        except Exception as e:
            raise RuntimeError(f"Failed to delete column: {str(e)}")

    def rename_column(
        self,
        sheet_id: str,
        column_id: str,
        new_title: str,
        update_references: bool = True
    ) -> Dict[str, Any]:
        """
        Rename a column while preserving relationships.

        Args:
            sheet_id: Smartsheet sheet ID
            column_id: Column ID to rename
            new_title: New column title
            update_references: Update formulas referencing this column

        Returns:
            Dict containing success message and update details
        """
        try:
            # Get current sheet info
            sheet_info = self.get_sheet_info(sheet_id)
            
            # Find current column title
            old_title = None
            for title, info in sheet_info['column_info'].items():
                if info['id'] == column_id:
                    old_title = title
                    break

            if not old_title:
                raise ValueError(f"Column ID {column_id} not found")

            # Create column object for update
            column = smartsheet.models.Column({
                'title': new_title
            })

            # Update the column
            self.client.Sheets.update_column(sheet_id, int(column_id), column)

            updated_references = []
            if update_references:
                # Update formula references in other columns
                for col_name, col_info in sheet_info['column_info'].items():
                    if col_info.get('type') == 'FORMULA':
                        formula = col_info.get('formula', '')
                        if f'[{old_title}]' in formula:
                            # Update formula to use new title
                            new_formula = formula.replace(f'[{old_title}]', f'[{new_title}]')
                            update_col = smartsheet.models.Column({
                                'id': int(col_info['id']),
                                'formula': new_formula
                            })
                            self.client.Sheets.update_column(sheet_id, update_col)
                            updated_references.append({
                                'column': col_name,
                                'old_formula': formula,
                                'new_formula': new_formula
                            })

            result = {
                "message": "Successfully renamed column",
                "old_title": old_title,
                "new_title": new_title,
                "column_id": column_id
            }

            if updated_references:
                result["updated_references"] = updated_references

            return result

        except Exception as e:
            raise RuntimeError(f"Failed to rename column: {str(e)}")

    def _evaluate_condition(
        self,
        condition: Dict[str, Any],
        cell_value: Any,
        cell_type: str
    ) -> bool:
        """
        Evaluate a single condition against a cell value.
        
        Args:
            condition: Condition definition with operator and value
            cell_value: The cell value to check
            cell_type: The type of the cell (for type-specific comparisons)
            
        Returns:
            bool indicating if condition is met
        """
        try:
            operator = condition['operator']
            expected_value = condition.get('value')
            
            # Handle empty checks first
            if operator == 'isEmpty':
                return cell_value is None or str(cell_value).strip() == ''
            if operator == 'isNotEmpty':
                return cell_value is not None and str(cell_value).strip() != ''
            
            # If cell is empty and we're not checking for emptiness, condition fails
            if cell_value is None:
                return False
                
            # Convert values for comparison based on type
            if cell_type == 'DATE':
                from datetime import datetime
                if isinstance(cell_value, str):
                    cell_value = datetime.fromisoformat(cell_value.replace('Z', '+00:00'))
                if isinstance(expected_value, str):
                    expected_value = datetime.fromisoformat(expected_value.replace('Z', '+00:00'))
            elif cell_type in ['TEXT_NUMBER', 'PICKLIST']:
                cell_value = str(cell_value)
                if expected_value is not None:
                    expected_value = str(expected_value)
            
            # Perform comparison based on operator
            if operator == 'equals':
                return cell_value == expected_value
            elif operator == 'contains':
                return expected_value in str(cell_value)
            elif operator == 'greaterThan':
                return cell_value > expected_value
            elif operator == 'lessThan':
                return cell_value < expected_value
            
            return False
            
        except Exception:
            # If any error occurs during evaluation, condition fails
            return False

    def _evaluate_conditions(
        self,
        conditions: List[Dict[str, Any]],
        row: Any,
        column_info: Dict[str, Any]
    ) -> bool:
        """
        Evaluate all conditions for a row (AND logic).
        
        Args:
            conditions: List of conditions to evaluate
            row: Row data to check
            column_info: Column metadata for type information
            
        Returns:
            bool indicating if all conditions are met
        """
        for condition in conditions:
            column_id = condition['columnId']
            # Find the cell with matching column ID
            matching_cell = None
            cell_type = 'TEXT_NUMBER'  # default type
            
            for cell in row.cells:
                if str(cell.column_id) == str(column_id):
                    matching_cell = cell
                    # Find column type from column_info
                    for col_name, info in column_info.items():
                        if info['id'] == str(column_id):
                            cell_type = info.get('type', 'TEXT_NUMBER')
                            break
                    break
            
            if not matching_cell:
                return False
                
            if not self._evaluate_condition(condition, matching_cell.value, cell_type):
                return False
        
        return True

    def bulk_update(
        self,
        sheet_id: str,
        rules: List[Dict[str, Any]],
        options: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Perform conditional bulk updates on a sheet.
        
        Args:
            sheet_id: Smartsheet sheet ID
            rules: List of update rules, each containing conditions and updates
            options: Update options including:
                - lenientMode: Allow partial success
                - batchSize: Number of rows per batch (default 500)
                
        Returns:
            Dict containing operation results
        """
        try:
            # Get sheet info for column validation
            sheet_info = self.get_sheet_info(sheet_id)
            column_info = sheet_info.get('column_info', {})
            
            # Get the sheet with all rows
            sheet = self.client.Sheets.get_sheet(sheet_id)
            
            # Initialize result tracking
            result = {
                'totalAttempted': 0,
                'successCount': 0,
                'failureCount': 0,
                'failures': []
            }
            
            # Process in batches
            batch_size = options.get('batchSize', 500)
            lenient_mode = options.get('lenientMode', False)
            
            for i in range(0, len(sheet.rows), batch_size):
                batch_rows = sheet.rows[i:i + batch_size]
                updates_batch = []
                
                # Find rows that match conditions and prepare updates
                for row in batch_rows:
                    result['totalAttempted'] += 1
                    row_updates = []
                    
                    try:
                        # Check each rule
                        for rule in rules:
                            if self._evaluate_conditions(rule['conditions'], row, column_info):
                                # All conditions met, add updates
                                for update in rule['updates']:
                                    cell = smartsheet.models.Cell()
                                    cell.column_id = int(update['columnId'])
                                    cell.value = update['value']
                                    row_updates.append(cell)
                        
                        if row_updates:
                            # Create row object for update
                            new_row = smartsheet.models.Row()
                            new_row.id_ = row.id_
                            new_row.cells = row_updates
                            updates_batch.append(new_row)
                            
                    except Exception as e:
                        result['failureCount'] += 1
                        result['failures'].append({
                            'rowId': str(row.id),
                            'error': str(e),
                            'rollbackStatus': 'not_attempted'
                        })
                        if not lenient_mode:
                            raise
                
                # Perform batch update if we have any updates
                if updates_batch:
                    try:
                        self.client.Sheets.update_rows(sheet_id, updates_batch)
                        result['successCount'] += len(updates_batch)
                    except Exception as e:
                        result['failureCount'] += len(updates_batch)
                        for row in updates_batch:
                            result['failures'].append({
                                'rowId': str(row.id_),
                                'error': str(e),
                                'rollbackStatus': 'failed'
                            })
                        if not lenient_mode:
                            raise
            
            return result
            
        except Exception as e:
            raise RuntimeError(f"Failed to perform bulk update: {str(e)}")

    def _validate_row_ids(
        self,
        sheet_id: str,
        row_ids: List[str]
    ) -> Tuple[List[str], List[Dict[str, str]]]:
        """
        Validate row IDs exist in sheet.

        Args:
            sheet_id: Sheet ID
            row_ids: List of row IDs to validate

        Returns:
            Tuple of (valid_ids: List[str], errors: List[Dict[str, str]])
        """
        try:
            # Get the sheet with row IDs
            sheet = self.client.Sheets.get_sheet(sheet_id)
            
            # Create set of existing row IDs
            existing_ids = {str(row.id_) for row in sheet.rows}
            
            valid_ids = []
            errors = []
            
            for row_id in row_ids:
                if row_id not in existing_ids:
                    errors.append({
                        'row_id': row_id,
                        'reason': 'Row not found'
                    })
                else:
                    valid_ids.append(row_id)
            
            return valid_ids, errors

        except Exception as e:
            raise RuntimeError(f"Failed to validate row IDs: {str(e)}")
            
    # Workspace Operations
    
    def list_workspaces(self) -> Dict[str, Any]:
        """
        List all accessible workspaces.
        
        Returns:
            Dict containing list of workspaces with their IDs, names, and permalinks
        
        Raises:
            RuntimeError: If listing workspaces fails
        """
        try:
            response = self.client.Workspaces.list_workspaces()
            workspaces = []
            
            for workspace in response.data:
                # Convert all values to their string representation to ensure JSON serialization
                workspace_data = {
                    "id": str(workspace.id),
                    "name": str(workspace.name),
                    "permalink": str(workspace.permalink) if hasattr(workspace, 'permalink') else None
                }
                
                # Handle access_level which might be an EnumeratedValue
                if hasattr(workspace, 'access_level'):
                    workspace_data["access_level"] = str(workspace.access_level)
                
                workspaces.append(workspace_data)
                
            return {
                "workspaces": workspaces,
                "total_count": len(workspaces)
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to list workspaces: {str(e)}")
    
    def get_workspace(self, workspace_id: Union[str, int]) -> Dict[str, Any]:
        """
        Get details of a specific workspace.
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Dict containing workspace details including sheets, folders, and reports
            
        Raises:
            RuntimeError: If getting workspace fails
        """
        try:
            # Convert workspace_id to int if it's a string
            if isinstance(workspace_id, str):
                workspace_id = int(workspace_id)
                
            workspace = self.client.Workspaces.get_workspace(workspace_id)
            
            # Process sheets
            sheets = []
            if hasattr(workspace, 'sheets') and workspace.sheets:
                for sheet in workspace.sheets:
                    sheets.append({
                        "id": str(sheet.id),
                        "name": str(sheet.name),
                        "permalink": str(sheet.permalink) if hasattr(sheet, 'permalink') else None
                    })
            
            # Process folders
            folders = []
            if hasattr(workspace, 'folders') and workspace.folders:
                for folder in workspace.folders:
                    folders.append({
                        "id": str(folder.id),
                        "name": str(folder.name)
                    })
            
            # Process reports
            reports = []
            if hasattr(workspace, 'reports') and workspace.reports:
                for report in workspace.reports:
                    reports.append({
                        "id": str(report.id),
                        "name": str(report.name)
                    })
            
            # Process sights (dashboards)
            sights = []
            if hasattr(workspace, 'sights') and workspace.sights:
                for sight in workspace.sights:
                    sights.append({
                        "id": str(sight.id),
                        "name": str(sight.name)
                    })
            
            # Convert all values to strings to ensure JSON serialization
            result = {
                "id": str(workspace.id),
                "name": str(workspace.name),
                "permalink": str(workspace.permalink) if hasattr(workspace, 'permalink') else None,
                "sheets": sheets,
                "folders": folders,
                "reports": reports,
                "sights": sights
            }
            
            # Handle access_level which might be an EnumeratedValue
            if hasattr(workspace, 'access_level'):
                result["access_level"] = str(workspace.access_level)
            
            return result
            
        except Exception as e:
            raise RuntimeError(f"Failed to get workspace: {str(e)}")
    
    def create_workspace(self, name: str) -> Dict[str, Any]:
        """
        Create a new workspace.
        
        Args:
            name: Name for the new workspace
            
        Returns:
            Dict containing success message and new workspace ID
            
        Raises:
            RuntimeError: If creating workspace fails
        """
        try:
            # Create workspace object
            workspace = smartsheet.models.Workspace({
                'name': name
            })
            
            # Create the workspace
            response = self.client.Workspaces.create_workspace(workspace)
            
            return {
                "success": True,
                "message": "Successfully created workspace",
                "workspace_id": str(response.result.id),
                "name": response.result.name
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to create workspace: {str(e)}")
    
    def create_sheet_in_workspace(self, workspace_id: Union[str, int], sheet_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a sheet in a workspace.
        
        Args:
            workspace_id: Workspace ID
            sheet_data: Sheet configuration including name and columns
                {
                    'name': str,
                    'columns': [
                        {
                            'title': str,
                            'type': str,
                            'options': List[str] (optional)
                        },
                        ...
                    ]
                }
                
        Returns:
            Dict containing success message and new sheet ID
            
        Raises:
            RuntimeError: If creating sheet fails
        """
        try:
            # Convert workspace_id to int if it's a string
            if isinstance(workspace_id, str):
                workspace_id = int(workspace_id)
            
            # Validate sheet data
            if not sheet_data.get('name'):
                raise ValueError("Sheet name is required")
                
            if not sheet_data.get('columns') or not isinstance(sheet_data['columns'], list):
                raise ValueError("Sheet columns are required and must be a list")
            
            # Create column objects
            columns = []
            for i, col in enumerate(sheet_data['columns']):
                column = smartsheet.models.Column({
                    'title': col['title'],
                    'type': col['type'],
                    'primary': i == 0  # Set the first column as primary
                })
                
                # Add options for PICKLIST type
                if col['type'] == 'PICKLIST' and 'options' in col:
                    column.options = col['options']
                    
                columns.append(column)
            
            # Create sheet object
            sheet = smartsheet.models.Sheet({
                'name': sheet_data['name'],
                'columns': columns
            })
            
            # Create the sheet in the workspace
            response = self.client.Workspaces.create_sheet_in_workspace(workspace_id, sheet)
            
            return {
                "success": True,
                "message": "Successfully created sheet in workspace",
                "sheet_id": str(response.result.id),
                "name": response.result.name,
                "workspace_id": str(workspace_id)
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to create sheet in workspace: {str(e)}")
    
    def list_workspace_sheets(self, workspace_id: Union[str, int]) -> Dict[str, Any]:
        """
        List all sheets in a workspace.
        
        Args:
            workspace_id: Workspace ID
            
        Returns:
            Dict containing list of sheets in the workspace
            
        Raises:
            RuntimeError: If listing workspace sheets fails
        """
        try:
            # Convert workspace_id to int if it's a string
            if isinstance(workspace_id, str):
                workspace_id = int(workspace_id)
                
            # Get the workspace
            workspace = self.client.Workspaces.get_workspace(workspace_id)
            
            sheets = []
            if hasattr(workspace, 'sheets') and workspace.sheets:
                for sheet in workspace.sheets:
                    sheet_data = {
                        "id": str(sheet.id),
                        "name": str(sheet.name),
                        "permalink": str(sheet.permalink) if hasattr(sheet, 'permalink') else None
                    }
                    
                    # Handle created_at and modified_at which might be special types
                    if hasattr(sheet, 'created_at') and sheet.created_at is not None:
                        sheet_data["created_at"] = str(sheet.created_at)
                    
                    if hasattr(sheet, 'modified_at') and sheet.modified_at is not None:
                        sheet_data["modified_at"] = str(sheet.modified_at)
                        
                    sheets.append(sheet_data)
            
            return {
                "workspace_id": str(workspace_id),
                "workspace_name": str(workspace.name),
                "sheets": sheets,
                "total_count": len(sheets)
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to list workspace sheets: {str(e)}")
    
    # Attachment Management Methods
    def upload_attachment(
        self,
        sheet_id: str,
        file_path: str,
        attachment_type: str,
        target_id: Optional[str] = None,
        file_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload a file attachment to a sheet, row, or comment.
        
        Args:
            sheet_id: Smartsheet sheet ID
            file_path: Local path to the file to upload
            attachment_type: Type of attachment ('sheet', 'row', 'comment')
            target_id: Row ID or Comment ID (not needed for sheet attachments)
            file_name: Optional custom name for the uploaded file
        
        Returns:
            Dict containing attachment details and upload status
        """
        try:
            import os
            
            # Validate file exists
            if not os.path.exists(file_path):
                return {"error": f"File not found: {file_path}"}
            
            # Get file size
            file_size = os.path.getsize(file_path)
            if file_size > 100 * 1024 * 1024:  # 100MB limit
                return {"error": f"File too large: {file_size} bytes (max 100MB)"}
            
            # Use custom name or original filename
            if not file_name:
                file_name = os.path.basename(file_path)
            
            result = None
            
            if attachment_type == 'sheet':
                # Attach to sheet
                result = self.client.Attachments.attach_file_to_sheet(
                    sheet_id,
                    open(file_path, 'rb'),
                    file_name,
                    file_size
                )
            elif attachment_type == 'row':
                if not target_id:
                    return {"error": "Row ID required for row attachments"}
                # Attach to row
                result = self.client.Attachments.attach_file_to_row(
                    sheet_id,
                    int(target_id),
                    open(file_path, 'rb'),
                    file_name,
                    file_size
                )
            elif attachment_type == 'comment':
                if not target_id:
                    return {"error": "Comment ID required for comment attachments"}
                # Attach to comment
                result = self.client.Attachments.attach_file_to_comment(
                    sheet_id,
                    int(target_id),
                    open(file_path, 'rb'),
                    file_name,
                    file_size
                )
            else:
                return {"error": f"Invalid attachment type: {attachment_type}"}
            
            if result and result.result:
                attachment = result.result
                return {
                    "success": True,
                    "attachment_id": str(attachment.id),
                    "name": attachment.name,
                    "url": attachment.url if hasattr(attachment, 'url') else None,
                    "size_bytes": attachment.size_in_kb * 1024 if hasattr(attachment, 'size_in_kb') else file_size,
                    "attachment_type": attachment_type,
                    "target_id": target_id,
                    "created_at": str(attachment.created_at) if hasattr(attachment, 'created_at') else None
                }
            else:
                return {"error": "Failed to upload attachment"}
                
        except Exception as e:
            return {"error": f"Failed to upload attachment: {str(e)}"}
    
    def get_attachments(
        self,
        sheet_id: str,
        attachment_type: str,
        target_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        List all attachments for a sheet or row.
        
        Args:
            sheet_id: Smartsheet sheet ID
            attachment_type: Type of attachment target ('sheet' or 'row')
            target_id: Row ID (only for row attachments)
        
        Returns:
            Dict containing list of attachments and metadata
        """
        try:
            attachments_list = []
            
            if attachment_type == 'sheet':
                # Get sheet attachments
                response = self.client.Attachments.list_all_attachments(
                    sheet_id,
                    include_all=True
                )
                if response and response.data:
                    for attachment in response.data:
                        attachments_list.append({
                            "attachment_id": str(attachment.id),
                            "name": attachment.name,
                            "url": attachment.url if hasattr(attachment, 'url') else None,
                            "url_expires_in_millis": attachment.url_expires_in_millis if hasattr(attachment, 'url_expires_in_millis') else None,
                            "size_bytes": attachment.size_in_kb * 1024 if hasattr(attachment, 'size_in_kb') else None,
                            "attachment_type": attachment.attachment_type if hasattr(attachment, 'attachment_type') else None,
                            "mime_type": attachment.mime_type if hasattr(attachment, 'mime_type') else None,
                            "created_at": str(attachment.created_at) if hasattr(attachment, 'created_at') else None,
                            "created_by": attachment.created_by.email if hasattr(attachment, 'created_by') and hasattr(attachment.created_by, 'email') else None
                        })
                        
            elif attachment_type == 'row':
                if not target_id:
                    return {"error": "Row ID required for row attachments"}
                # Get row attachments
                response = self.client.Attachments.list_row_attachments(
                    sheet_id,
                    int(target_id),
                    include_all=True
                )
                if response and response.data:
                    for attachment in response.data:
                        attachments_list.append({
                            "attachment_id": str(attachment.id),
                            "name": attachment.name,
                            "url": attachment.url if hasattr(attachment, 'url') else None,
                            "url_expires_in_millis": attachment.url_expires_in_millis if hasattr(attachment, 'url_expires_in_millis') else None,
                            "size_bytes": attachment.size_in_kb * 1024 if hasattr(attachment, 'size_in_kb') else None,
                            "attachment_type": attachment.attachment_type if hasattr(attachment, 'attachment_type') else None,
                            "mime_type": attachment.mime_type if hasattr(attachment, 'mime_type') else None,
                            "created_at": str(attachment.created_at) if hasattr(attachment, 'created_at') else None,
                            "created_by": attachment.created_by.email if hasattr(attachment, 'created_by') and hasattr(attachment.created_by, 'email') else None
                        })
            else:
                return {"error": f"Invalid attachment type: {attachment_type}"}
            
            return {
                "success": True,
                "attachments": attachments_list,
                "total_count": len(attachments_list),
                "attachment_type": attachment_type,
                "target_id": target_id
            }
            
        except Exception as e:
            return {"error": f"Failed to get attachments: {str(e)}"}
    
    def download_attachment(
        self,
        sheet_id: str,
        attachment_id: str,
        save_path: str
    ) -> Dict[str, Any]:
        """
        Download a specific attachment.
        
        Args:
            sheet_id: Smartsheet sheet ID
            attachment_id: Attachment ID to download
            save_path: Local path where to save the file
        
        Returns:
            Dict containing download status and file information
        """
        try:
            import os
            import urllib.request
            
            # Get attachment details
            attachment = self.client.Attachments.get_attachment(sheet_id, int(attachment_id))
            
            if not attachment or not attachment.url:
                return {"error": "Attachment not found or URL not available"}
            
            # Create directory if it doesn't exist
            save_dir = os.path.dirname(save_path)
            if save_dir and not os.path.exists(save_dir):
                os.makedirs(save_dir)
            
            # Download the file
            urllib.request.urlretrieve(attachment.url, save_path)
            
            # Verify download
            if os.path.exists(save_path):
                file_size = os.path.getsize(save_path)
                return {
                    "success": True,
                    "attachment_id": attachment_id,
                    "name": attachment.name,
                    "saved_to": save_path,
                    "size_bytes": file_size,
                    "mime_type": attachment.mime_type if hasattr(attachment, 'mime_type') else None
                }
            else:
                return {"error": "Failed to save file"}
                
        except Exception as e:
            return {"error": f"Failed to download attachment: {str(e)}"}
    
    def delete_attachment(
        self,
        sheet_id: str,
        attachment_id: str
    ) -> Dict[str, Any]:
        """
        Delete an attachment from a sheet.
        
        Args:
            sheet_id: Smartsheet sheet ID
            attachment_id: Attachment ID to delete
        
        Returns:
            Dict containing deletion status
        """
        try:
            # Delete the attachment
            result = self.client.Attachments.delete_attachment(sheet_id, int(attachment_id))
            
            return {
                "success": True,
                "attachment_id": attachment_id,
                "message": "Attachment deleted successfully"
            }
            
        except Exception as e:
            return {"error": f"Failed to delete attachment: {str(e)}"}
    
    # Discussion and Comment Management Methods
    def create_discussion(
        self,
        sheet_id: str,
        discussion_type: str,
        comment_text: str,
        target_id: Optional[str] = None,
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new discussion thread on a sheet or row.
        
        Args:
            sheet_id: Smartsheet sheet ID
            discussion_type: Type of discussion ('sheet' or 'row')
            comment_text: Initial comment text for the discussion
            target_id: Row ID (only for row discussions)
            title: Discussion title/subject (optional)
        
        Returns:
            Dict containing discussion details and creation status
        """
        try:
            import smartsheet.models as models
            
            # Create the initial comment
            comment = models.Comment()
            comment.text = comment_text
            
            result = None
            
            if discussion_type == 'sheet':
                # Create discussion on sheet
                result = self.client.Discussions.create_discussion_on_sheet(
                    sheet_id,
                    comment
                )
            elif discussion_type == 'row':
                if not target_id:
                    return {"error": "Row ID required for row discussions"}
                # Create discussion on row
                result = self.client.Discussions.create_discussion_on_row(
                    sheet_id,
                    int(target_id),
                    comment
                )
            else:
                return {"error": f"Invalid discussion type: {discussion_type}"}
            
            if result and result.result:
                discussion = result.result
                return {
                    "success": True,
                    "discussion_id": str(discussion.id),
                    "title": discussion.title if hasattr(discussion, 'title') else title,
                    "comment_count": discussion.comment_count if hasattr(discussion, 'comment_count') else 1,
                    "discussion_type": discussion_type,
                    "target_id": target_id,
                    "created_by": discussion.created_by.email if hasattr(discussion, 'created_by') and hasattr(discussion.created_by, 'email') else None,
                    "created_at": str(discussion.created_at) if hasattr(discussion, 'created_at') else None,
                    "last_commented_user": discussion.last_commented_user.email if hasattr(discussion, 'last_commented_user') and hasattr(discussion.last_commented_user, 'email') else None,
                    "last_commented_at": str(discussion.last_commented_at) if hasattr(discussion, 'last_commented_at') else None
                }
            else:
                return {"error": "Failed to create discussion"}
                
        except Exception as e:
            return {"error": f"Failed to create discussion: {str(e)}"}
    
    def add_comment(
        self,
        sheet_id: str,
        discussion_id: str,
        comment_text: str
    ) -> Dict[str, Any]:
        """
        Add a comment to an existing discussion.
        
        Args:
            sheet_id: Smartsheet sheet ID
            discussion_id: Discussion ID to add comment to
            comment_text: Comment text to add
        
        Returns:
            Dict containing comment details and creation status
        """
        try:
            import smartsheet.models as models
            
            # Create the comment
            comment = models.Comment()
            comment.text = comment_text
            
            # Add comment to discussion
            result = self.client.Discussions.add_comment_to_discussion(
                sheet_id,
                int(discussion_id),
                comment
            )
            
            if result and result.result:
                new_comment = result.result
                return {
                    "success": True,
                    "comment_id": str(new_comment.id),
                    "discussion_id": discussion_id,
                    "text": new_comment.text,
                    "created_by": new_comment.created_by.email if hasattr(new_comment, 'created_by') and hasattr(new_comment.created_by, 'email') else None,
                    "created_at": str(new_comment.created_at) if hasattr(new_comment, 'created_at') else None,
                    "modified_at": str(new_comment.modified_at) if hasattr(new_comment, 'modified_at') else None
                }
            else:
                return {"error": "Failed to add comment"}
                
        except Exception as e:
            return {"error": f"Failed to add comment: {str(e)}"}
    
    def get_discussions(
        self,
        sheet_id: str,
        discussion_type: str,
        target_id: Optional[str] = None,
        include_comments: bool = False
    ) -> Dict[str, Any]:
        """
        List all discussions for a sheet or row.
        
        Args:
            sheet_id: Smartsheet sheet ID
            discussion_type: Type of discussion target ('sheet' or 'row')
            target_id: Row ID (only for row discussions)
            include_comments: Include all comments in discussions
        
        Returns:
            Dict containing list of discussions and metadata
        """
        try:
            discussions_list = []
            
            if discussion_type == 'sheet':
                # Get sheet discussions
                response = self.client.Discussions.get_all_discussions(
                    sheet_id,
                    include_all=True if include_comments else False
                )
                if response and response.data:
                    for discussion in response.data:
                        discussion_data = {
                            "discussion_id": str(discussion.id),
                            "title": discussion.title if hasattr(discussion, 'title') else None,
                            "comment_count": discussion.comment_count if hasattr(discussion, 'comment_count') else 0,
                            "created_by": discussion.created_by.email if hasattr(discussion, 'created_by') and hasattr(discussion.created_by, 'email') else None,
                            "created_at": str(discussion.created_at) if hasattr(discussion, 'created_at') else None,
                            "last_commented_user": discussion.last_commented_user.email if hasattr(discussion, 'last_commented_user') and hasattr(discussion.last_commented_user, 'email') else None,
                            "last_commented_at": str(discussion.last_commented_at) if hasattr(discussion, 'last_commented_at') else None
                        }
                        
                        # Include comments if requested
                        if include_comments and hasattr(discussion, 'comments') and discussion.comments:
                            discussion_data["comments"] = []
                            for comment in discussion.comments:
                                comment_data = {
                                    "comment_id": str(comment.id),
                                    "text": comment.text,
                                    "created_by": comment.created_by.email if hasattr(comment, 'created_by') and hasattr(comment.created_by, 'email') else None,
                                    "created_at": str(comment.created_at) if hasattr(comment, 'created_at') else None,
                                    "modified_at": str(comment.modified_at) if hasattr(comment, 'modified_at') else None
                                }
                                discussion_data["comments"].append(comment_data)
                        
                        discussions_list.append(discussion_data)
                        
            elif discussion_type == 'row':
                if not target_id:
                    return {"error": "Row ID required for row discussions"}
                # Get row discussions
                response = self.client.Discussions.get_row_discussions(
                    sheet_id,
                    int(target_id),
                    include_all=True if include_comments else False
                )
                if response and response.data:
                    for discussion in response.data:
                        discussion_data = {
                            "discussion_id": str(discussion.id),
                            "title": discussion.title if hasattr(discussion, 'title') else None,
                            "comment_count": discussion.comment_count if hasattr(discussion, 'comment_count') else 0,
                            "created_by": discussion.created_by.email if hasattr(discussion, 'created_by') and hasattr(discussion.created_by, 'email') else None,
                            "created_at": str(discussion.created_at) if hasattr(discussion, 'created_at') else None,
                            "last_commented_user": discussion.last_commented_user.email if hasattr(discussion, 'last_commented_user') and hasattr(discussion.last_commented_user, 'email') else None,
                            "last_commented_at": str(discussion.last_commented_at) if hasattr(discussion, 'last_commented_at') else None
                        }
                        
                        # Include comments if requested
                        if include_comments and hasattr(discussion, 'comments') and discussion.comments:
                            discussion_data["comments"] = []
                            for comment in discussion.comments:
                                comment_data = {
                                    "comment_id": str(comment.id),
                                    "text": comment.text,
                                    "created_by": comment.created_by.email if hasattr(comment, 'created_by') and hasattr(comment.created_by, 'email') else None,
                                    "created_at": str(comment.created_at) if hasattr(comment, 'created_at') else None,
                                    "modified_at": str(comment.modified_at) if hasattr(comment, 'modified_at') else None
                                }
                                discussion_data["comments"].append(comment_data)
                        
                        discussions_list.append(discussion_data)
            else:
                return {"error": f"Invalid discussion type: {discussion_type}"}
            
            return {
                "success": True,
                "discussions": discussions_list,
                "total_count": len(discussions_list),
                "discussion_type": discussion_type,
                "target_id": target_id,
                "include_comments": include_comments
            }
            
        except Exception as e:
            return {"error": f"Failed to get discussions: {str(e)}"}
    
    def get_comments(
        self,
        sheet_id: str,
        discussion_id: str,
        include_attachments: bool = True
    ) -> Dict[str, Any]:
        """
        Get all comments in a discussion thread.
        
        Args:
            sheet_id: Smartsheet sheet ID
            discussion_id: Discussion ID to get comments from
            include_attachments: Include attachment information
        
        Returns:
            Dict containing list of comments and metadata
        """
        try:
            # Get the specific discussion with comments
            discussion = self.client.Discussions.get_discussion(
                sheet_id,
                int(discussion_id)
            )
            
            if not discussion:
                return {"error": "Discussion not found"}
            
            comments_list = []
            if hasattr(discussion, 'comments') and discussion.comments:
                for comment in discussion.comments:
                    comment_data = {
                        "comment_id": str(comment.id),
                        "text": comment.text,
                        "created_by": comment.created_by.email if hasattr(comment, 'created_by') and hasattr(comment.created_by, 'email') else None,
                        "created_at": str(comment.created_at) if hasattr(comment, 'created_at') else None,
                        "modified_at": str(comment.modified_at) if hasattr(comment, 'modified_at') else None
                    }
                    
                    # Include attachments if requested
                    if include_attachments and hasattr(comment, 'attachments') and comment.attachments:
                        comment_data["attachments"] = []
                        for attachment in comment.attachments:
                            attachment_data = {
                                "attachment_id": str(attachment.id),
                                "name": attachment.name,
                                "url": attachment.url if hasattr(attachment, 'url') else None,
                                "size_bytes": attachment.size_in_kb * 1024 if hasattr(attachment, 'size_in_kb') else None,
                                "mime_type": attachment.mime_type if hasattr(attachment, 'mime_type') else None,
                                "created_at": str(attachment.created_at) if hasattr(attachment, 'created_at') else None
                            }
                            comment_data["attachments"].append(attachment_data)
                    
                    comments_list.append(comment_data)
            
            return {
                "success": True,
                "discussion_id": discussion_id,
                "discussion_title": discussion.title if hasattr(discussion, 'title') else None,
                "comments": comments_list,
                "total_comments": len(comments_list),
                "include_attachments": include_attachments
            }
            
        except Exception as e:
            return {"error": f"Failed to get comments: {str(e)}"}
    
    def delete_comment(
        self,
        sheet_id: str,
        comment_id: str
    ) -> Dict[str, Any]:
        """
        Delete a specific comment from a discussion.
        
        Args:
            sheet_id: Smartsheet sheet ID
            comment_id: Comment ID to delete
        
        Returns:
            Dict containing deletion status
        """
        try:
            # Delete the comment
            result = self.client.Comments.delete_comment(sheet_id, int(comment_id))
            
            return {
                "success": True,
                "comment_id": comment_id,
                "message": "Comment deleted successfully"
            }
            
        except Exception as e:
            return {"error": f"Failed to delete comment: {str(e)}"}
    
    # Cell History and Audit Tracking Methods
    def get_cell_history(
        self,
        sheet_id: str,
        row_id: str,
        column_id: str,
        include_all: bool = True
    ) -> Dict[str, Any]:
        """
        Get modification history for a specific cell.
        
        Args:
            sheet_id: Smartsheet sheet ID
            row_id: Row ID containing the cell
            column_id: Column ID of the cell
            include_all: Include all historical data
        
        Returns:
            Dict containing cell history and metadata
        """
        try:
            # Get cell history
            response = self.client.Cells.get_cell_history(
                sheet_id,
                int(row_id),
                int(column_id),
                include_all=include_all
            )
            
            if not response or not response.data:
                return {
                    "success": True,
                    "cell_history": [],
                    "total_count": 0,
                    "sheet_id": sheet_id,
                    "row_id": row_id,
                    "column_id": column_id
                }
            
            history_list = []
            for cell in response.data:
                history_entry = {
                    "value": cell.value if hasattr(cell, 'value') else None,
                    "display_value": cell.display_value if hasattr(cell, 'display_value') else None,
                    "modified_at": str(cell.modified_at) if hasattr(cell, 'modified_at') else None,
                    "modified_by": cell.modified_by.email if hasattr(cell, 'modified_by') and hasattr(cell.modified_by, 'email') else None,
                    "column_id": str(cell.column_id) if hasattr(cell, 'column_id') else column_id,
                    "row_id": str(cell.row_id) if hasattr(cell, 'row_id') else row_id
                }
                
                # Add formula information if present
                if hasattr(cell, 'formula') and cell.formula:
                    history_entry["formula"] = cell.formula
                
                # Add format information if present
                if hasattr(cell, 'format') and cell.format:
                    history_entry["format"] = str(cell.format)
                
                history_list.append(history_entry)
            
            # Sort by modification date (most recent first)
            history_list.sort(
                key=lambda x: x['modified_at'] if x['modified_at'] else '',
                reverse=True
            )
            
            return {
                "success": True,
                "cell_history": history_list,
                "total_count": len(history_list),
                "sheet_id": sheet_id,
                "row_id": row_id,
                "column_id": column_id,
                "include_all": include_all
            }
            
        except Exception as e:
            return {"error": f"Failed to get cell history: {str(e)}"}
    
    def get_row_history(
        self,
        sheet_id: str,
        row_id: str,
        include_all: bool = True,
        column_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get change history for an entire row (all cells or specific columns).
        
        Args:
            sheet_id: Smartsheet sheet ID
            row_id: Row ID to get history for
            include_all: Include all historical data
            column_ids: Specific column IDs to get history for (optional)
        
        Returns:
            Dict containing row history and metadata
        """
        try:
            # First get sheet info to get all columns if none specified
            if not column_ids:
                sheet_info = self.get_sheet_info(sheet_id)
                if 'error' in sheet_info:
                    return {"error": f"Failed to get sheet info: {sheet_info['error']}"}
                
                # Extract all column IDs from the column map
                column_map = sheet_info.get('column_map', {})
                column_ids = list(column_map.values())
            
            if not column_ids:
                return {"error": "No columns found for row history"}
            
            # Get history for each column in the row
            row_history = {}
            total_changes = 0
            
            for column_id in column_ids:
                try:
                    cell_history_result = self.get_cell_history(
                        sheet_id,
                        row_id,
                        column_id,
                        include_all
                    )
                    
                    if cell_history_result.get('success') and cell_history_result.get('cell_history'):
                        row_history[column_id] = cell_history_result['cell_history']
                        total_changes += len(cell_history_result['cell_history'])
                    else:
                        # Empty history for this column
                        row_history[column_id] = []
                        
                except Exception as cell_error:
                    # Skip columns that can't be accessed (might be system columns)
                    continue
            
            # Create a chronological timeline of all changes
            timeline = []
            for column_id, history in row_history.items():
                for entry in history:
                    timeline_entry = entry.copy()
                    timeline_entry['column_id'] = column_id
                    timeline.append(timeline_entry)
            
            # Sort timeline by modification date (most recent first)
            timeline.sort(
                key=lambda x: x['modified_at'] if x['modified_at'] else '',
                reverse=True
            )
            
            return {
                "success": True,
                "row_history": row_history,
                "timeline": timeline,
                "total_changes": total_changes,
                "columns_processed": len(row_history),
                "sheet_id": sheet_id,
                "row_id": row_id,
                "include_all": include_all
            }
            
        except Exception as e:
            return {"error": f"Failed to get row history: {str(e)}"}
    
    def get_sheet_cross_references(
        self, 
        sheet_id: str, 
        include_details: bool = True
    ) -> Dict[str, Any]:
        """
        Get all cross-sheet references in a sheet
        
        Args:
            sheet_id: Sheet ID to analyze
            include_details: Include detailed formula analysis
            
        Returns:
            Dict containing cross-sheet references found
        """
        try:
            import re
            
            # Get the sheet with all details
            sheet = self.client.Sheets.get_sheet(sheet_id, include='format,objectValue')
            
            cross_references = []
            total_refs = 0
            
            # Pattern to match cross-sheet references in formulas
            # Smartsheet cross-sheet references look like: {[Sheet Name]Column1}
            cross_ref_pattern = r'\{(\[[^\]]+\][^}]*)\}'
            
            # Analyze each row and column for formulas
            for row in sheet.rows:
                for cell in row.cells:
                    if cell.formula:
                        # Find cross-sheet references in this formula
                        matches = re.findall(cross_ref_pattern, cell.formula)
                        if matches:
                            # Get column info
                            column = next((col for col in sheet.columns if col.id == cell.column_id), None)
                            
                            for match in matches:
                                total_refs += 1
                                ref_info = {
                                    "row_id": str(row.id),
                                    "column_id": str(cell.column_id),
                                    "column_title": column.title if column else "Unknown",
                                    "reference": match,
                                    "formula": cell.formula if include_details else None,
                                    "cell_value": str(cell.value) if cell.value else None
                                }
                                
                                if include_details:
                                    # Try to parse sheet name from reference
                                    sheet_name_match = re.search(r'\[([^\]]+)\]', match)
                                    if sheet_name_match:
                                        ref_info["referenced_sheet_name"] = sheet_name_match.group(1)
                                
                                cross_references.append(ref_info)
            
            return {
                "success": True,
                "sheet_id": sheet_id,
                "sheet_name": sheet.name,
                "total_references": total_refs,
                "cross_references": cross_references,
                "include_details": include_details
            }
            
        except Exception as e:
            return {"error": f"Failed to get cross-sheet references: {str(e)}"}
    
    def find_sheet_references(
        self, 
        target_sheet_id: str, 
        workspace_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Find all sheets that reference a specific target sheet
        
        Args:
            target_sheet_id: Sheet ID to find references to
            workspace_id: Optional workspace ID to limit search scope
            
        Returns:
            Dict containing sheets that reference the target sheet
        """
        try:
            # First get the target sheet name for reference pattern matching
            target_sheet = self.client.Sheets.get_sheet(target_sheet_id)
            target_sheet_name = target_sheet.name
            
            # Get all sheets to search through
            if workspace_id:
                # Get sheets from specific workspace
                workspace = self.client.Workspaces.get_workspace(
                    int(workspace_id),
                    include='sheets'
                )
                sheets_to_search = [sheet for sheet in workspace.sheets]
            else:
                # Get all sheets user has access to
                all_sheets = self.client.Sheets.list_sheets(include_all=True)
                sheets_to_search = [sheet for sheet in all_sheets.data]
            
            referencing_sheets = []
            total_refs_found = 0
            
            # Search each sheet for references to target sheet
            for sheet_summary in sheets_to_search:
                if str(sheet_summary.id) == target_sheet_id:
                    continue  # Skip the target sheet itself
                
                try:
                    # Get cross-references in this sheet
                    sheet_refs = self.get_sheet_cross_references(str(sheet_summary.id), include_details=True)
                    
                    if sheet_refs.get('success') and sheet_refs.get('cross_references'):
                        # Check if any references point to our target sheet
                        matching_refs = []
                        for ref in sheet_refs['cross_references']:
                            if ref.get('referenced_sheet_name') == target_sheet_name:
                                matching_refs.append(ref)
                                total_refs_found += 1
                        
                        if matching_refs:
                            referencing_sheets.append({
                                "sheet_id": str(sheet_summary.id),
                                "sheet_name": sheet_summary.name,
                                "reference_count": len(matching_refs),
                                "references": matching_refs,
                                "permalink": getattr(sheet_summary, 'permalink', None)
                            })
                            
                except Exception as e:
                    # Skip sheets we can't access
                    continue
            
            return {
                "success": True,
                "target_sheet_id": target_sheet_id,
                "target_sheet_name": target_sheet_name,
                "workspace_id": workspace_id,
                "total_referencing_sheets": len(referencing_sheets),
                "total_references_found": total_refs_found,
                "referencing_sheets": referencing_sheets
            }
            
        except Exception as e:
            return {"error": f"Failed to find sheet references: {str(e)}"}
    
    def validate_cross_references(
        self, 
        sheet_id: str, 
        fix_broken: bool = False
    ) -> Dict[str, Any]:
        """
        Validate all cross-sheet references and check for broken links
        
        Args:
            sheet_id: Sheet ID to validate
            fix_broken: Attempt to fix broken references automatically
            
        Returns:
            Dict containing validation results and broken reference details
        """
        try:
            # Get all cross-references in the sheet
            refs_result = self.get_sheet_cross_references(sheet_id, include_details=True)
            
            if not refs_result.get('success'):
                return refs_result
            
            cross_references = refs_result.get('cross_references', [])
            
            valid_refs = []
            broken_refs = []
            fixed_refs = []
            
            # Get list of accessible sheets for validation
            all_sheets = self.client.Sheets.list_sheets(include_all=True)
            accessible_sheet_names = {sheet.name: str(sheet.id) for sheet in all_sheets.data}
            
            for ref in cross_references:
                referenced_sheet_name = ref.get('referenced_sheet_name')
                
                if not referenced_sheet_name:
                    # Could not parse sheet name from reference
                    broken_refs.append({
                        **ref,
                        "issue": "Cannot parse referenced sheet name from formula",
                        "fixable": False
                    })
                    continue
                
                if referenced_sheet_name in accessible_sheet_names:
                    # Reference appears valid
                    valid_refs.append({
                        **ref,
                        "referenced_sheet_id": accessible_sheet_names[referenced_sheet_name],
                        "status": "valid"
                    })
                else:
                    # Broken reference - sheet not found or not accessible
                    broken_ref = {
                        **ref,
                        "issue": f"Referenced sheet '{referenced_sheet_name}' not found or not accessible",
                        "fixable": False,
                        "status": "broken"
                    }
                    
                    # Check if we can suggest alternatives
                    similar_sheets = [name for name in accessible_sheet_names.keys() 
                                    if name.lower().replace(' ', '') in referenced_sheet_name.lower().replace(' ', '') or 
                                       referenced_sheet_name.lower().replace(' ', '') in name.lower().replace(' ', '')]
                    
                    if similar_sheets:
                        broken_ref["suggested_alternatives"] = similar_sheets
                        if fix_broken and len(similar_sheets) == 1:
                            broken_ref["fixable"] = True
                    
                    broken_refs.append(broken_ref)
            
            # If fix_broken is True, attempt to fix fixable references
            if fix_broken:
                # Note: Actual fixing would require updating formulas in cells
                # This is a complex operation and would need careful implementation
                # For now, we'll just mark what could be fixed
                for broken_ref in broken_refs:
                    if broken_ref.get("fixable"):
                        broken_ref["fix_attempted"] = True
                        # In a real implementation, we would update the cell formula here
                        # fixed_refs.append(broken_ref)
            
            return {
                "success": True,
                "sheet_id": sheet_id,
                "sheet_name": refs_result.get('sheet_name'),
                "total_references": len(cross_references),
                "valid_references": len(valid_refs),
                "broken_references": len(broken_refs),
                "fix_attempted": fix_broken,
                "references_fixed": len(fixed_refs),
                "validation_details": {
                    "valid": valid_refs,
                    "broken": broken_refs,
                    "fixed": fixed_refs
                }
            }
            
        except Exception as e:
            return {"error": f"Failed to validate cross-sheet references: {str(e)}"}
    
    def create_cross_reference(
        self, 
        sheet_id: str, 
        target_sheet_id: str, 
        formula_config: Dict[str, Any], 
        row_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create or update cross-sheet reference formulas
        
        Args:
            sheet_id: Source sheet ID
            target_sheet_id: Target sheet ID to reference
            formula_config: Configuration for the formula
            row_ids: Specific row IDs to apply formula to
            
        Returns:
            Dict containing operation results
        """
        try:
            import smartsheet.models as models
            
            # Get both sheets to validate and get column info
            source_sheet = self.client.Sheets.get_sheet(sheet_id)
            target_sheet = self.client.Sheets.get_sheet(target_sheet_id)
            
            source_column_id = formula_config['source_column_id']
            target_column_id = formula_config['target_column_id']
            formula_type = formula_config['formula_type']
            lookup_column_id = formula_config.get('lookup_column_id')
            custom_formula = formula_config.get('custom_formula')
            
            # Find column titles for formula building
            target_column = next((col for col in target_sheet.columns if str(col.id) == target_column_id), None)
            if not target_column:
                return {"error": f"Target column {target_column_id} not found in sheet {target_sheet_id}"}
            
            lookup_column = None
            if lookup_column_id:
                lookup_column = next((col for col in target_sheet.columns if str(col.id) == lookup_column_id), None)
                if not lookup_column:
                    return {"error": f"Lookup column {lookup_column_id} not found in sheet {target_sheet_id}"}
            
            # Build formula based on type
            formula_template = ""
            
            if formula_type == "INDEX_MATCH":
                if not lookup_column:
                    return {"error": "INDEX_MATCH requires lookup_column_id"}
                formula_template = f'=INDEX({{[{target_sheet.name}]{target_column.title}:Column{target_column.index}}}, MATCH([Column]@row, {{[{target_sheet.name}]{lookup_column.title}:Column{lookup_column.index}}}, 0))'
            
            elif formula_type == "VLOOKUP":
                if not lookup_column:
                    return {"error": "VLOOKUP requires lookup_column_id"}
                # Note: VLOOKUP in Smartsheet requires the lookup column to be left of the return column
                col_offset = target_column.index - lookup_column.index
                if col_offset <= 0:
                    return {"error": "VLOOKUP requires target column to be right of lookup column"}
                formula_template = f'=VLOOKUP([Column]@row, {{[{target_sheet.name}]{lookup_column.title}:Column{target_column.index}}}, {col_offset + 1}, false)'
            
            elif formula_type == "SUMIF":
                if not lookup_column:
                    return {"error": "SUMIF requires lookup_column_id"}
                formula_template = f'=SUMIF({{[{target_sheet.name}]{lookup_column.title}:Column{lookup_column.index}}}, [Column]@row, {{[{target_sheet.name}]{target_column.title}:Column{target_column.index}}})'
            
            elif formula_type == "COUNTIF":
                if not lookup_column:
                    return {"error": "COUNTIF requires lookup_column_id"}
                formula_template = f'=COUNTIF({{[{target_sheet.name}]{lookup_column.title}:Column{lookup_column.index}}}, [Column]@row)'
            
            elif formula_type == "CUSTOM":
                if not custom_formula:
                    return {"error": "CUSTOM formula type requires custom_formula"}
                formula_template = custom_formula
            
            else:
                return {"error": f"Unsupported formula type: {formula_type}"}
            
            # Apply formula to specified rows or all rows
            rows_to_update = []
            
            if row_ids:
                # Apply to specific rows
                for row_id in row_ids:
                    row = models.Row()
                    row.id = int(row_id)
                    
                    cell = models.Cell()
                    cell.column_id = int(source_column_id)
                    cell.formula = formula_template
                    row.cells = [cell]
                    
                    rows_to_update.append(row)
            else:
                # Apply to all rows (get current rows first)
                for row in source_sheet.rows:
                    row_update = models.Row()
                    row_update.id = row.id
                    
                    cell = models.Cell()
                    cell.column_id = int(source_column_id)
                    cell.formula = formula_template
                    row_update.cells = [cell]
                    
                    rows_to_update.append(row_update)
            
            # Update the rows with formulas
            result = self.client.Sheets.update_rows(sheet_id, rows_to_update)
            
            if result and result.result:
                updated_rows = result.result
                return {
                    "success": True,
                    "sheet_id": sheet_id,
                    "target_sheet_id": target_sheet_id,
                    "formula_type": formula_type,
                    "formula_template": formula_template,
                    "rows_updated": len(updated_rows),
                    "updated_row_ids": [str(row.id) for row in updated_rows]
                }
            else:
                return {"error": "Failed to update rows with cross-reference formula"}
                
        except Exception as e:
            return {"error": f"Failed to create cross-reference: {str(e)}"}
