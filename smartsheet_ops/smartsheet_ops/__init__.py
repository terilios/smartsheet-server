import smartsheet
import json
import re
from typing import Dict, List, Optional, Any, Tuple, Union

# System column types in their exact API form
SYSTEM_COLUMN_TYPES = {
    'AUTO_NUMBER',   # For auto-numbered columns
    'CREATED_DATE',  # For creation timestamp
    'MODIFIED_DATE', # For last modified timestamp
    'CREATED_BY',    # For creator info
    'MODIFIED_BY',   # For last modifier info
    'FORMULA'        # For formula columns
}

class SmartsheetOperations:
    def __init__(self, api_key: str):
        self.client = smartsheet.Smartsheet(api_key)
        self.client.errors_as_exceptions(True)

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
        """
        info = {
            "id": str(column.id_),
            "type": "TEXT_NUMBER",  # Default final/effective type
            "system_managed": False,
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

            # 1) Get column type from debug info first
            if '_type_' in info["debug"]:
                raw_type = info["debug"]['_type_']
                if raw_type and raw_type.lower() != 'none':
                    info["type"] = raw_type.strip()
                    # Handle PICKLIST type
                    if info["type"] == "PICKLIST":
                        self._process_picklist_options(column, info)

            # 2) Detect system column type (will override base type if recognized)
            system_type = None
            system_managed = False
            for attr in ['_system_column_type', 'system_column_type']:
                if hasattr(column, attr):
                    raw_value = str(getattr(column, attr))
                    normalized = self._normalize_column_type(raw_value)
                    if normalized in SYSTEM_COLUMN_TYPES:
                        info["system_column_type"] = raw_value
                        info["type"] = raw_value  # effective type becomes system type
                        system_type = raw_value
                        system_managed = True

                        if normalized == 'AUTO_NUMBER':
                            self._process_auto_number_config(column, info)
                        # Stop if system type is found
                        break

            # 3) If no system column type found, check for a formula
            if not system_type:
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
            
            # 4) Handle picklist options if it's a picklist
            if info["type"] == "PICKLIST":
                self._process_picklist_options(column, info)

            # 5) Add validation and format metadata
            self._add_metadata(column, info)

        except Exception:
            # If something goes wrong, we simply return what we have so far
            pass
            
        return info

    def get_sheet_info(self, sheet_id: str) -> Dict[str, Any]:
        """Get sheet information including columns and sample data."""
        try:
            # Get the sheet with level parameter for complex column types
            sheet = self.client.Sheets.get_sheet(
                sheet_id,
                level=2,
                include='objectValue'
            )
            
            # Get columns
            columns = sheet.columns
            column_map = {}
            column_info = {}
            
            # First pass: Map column titles to IDs
            for col in columns:
                try:
                    column_map[col.title] = str(col.id_)
                except:
                    continue
            
            # Second pass: Gather detailed info for each column
            for col in columns:
                try:
                    if col.title in column_map:
                        column_info[col.title] = self.get_column_info(col)
                except:
                    # Fallback to a minimal info if we fail parsing
                    if col.title in column_map:
                        column_info[col.title] = {
                            "id": column_map[col.title],
                            "type": "TEXT_NUMBER"
                        }
            
            # Gather up to 5 rows of sample data
            sample_data = []
            for i, row in enumerate(sheet.rows):
                if i >= 5:
                    break
                row_data = {
                    "__id": str(row.id)  # Include row ID in the data
                }
                for cell in row.cells:
                    # Find the column title for this cell
                    for col in columns:
                        if str(col.id_) == str(cell.column_id):
                            row_data[col.title] = cell.value
                            break
                sample_data.append(row_data)
            
            # Create an example row using the column_map
            example_row = {}
            for title in column_map.keys():
                example_row[title] = "sample_value"
            
            # Prepare final response
            return {
                "column_map": column_map,
                "column_info": column_info,
                "sample_data": sample_data,
                "usage_example": {
                    "column_map": column_map,
                    "row_data": [example_row]
                }
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to get sheet info: {str(e)}")

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
        """Add rows to a sheet. Skips system-managed columns."""
        try:
            # Retrieve sheet info to identify system-managed columns
            sheet_info = self.get_sheet_info(sheet_id)
            column_info = sheet_info.get('column_info', {})
            
            # Prepare new row models
            new_rows = []
            for data in row_data:
                new_row = smartsheet.models.Row()
                new_row.to_top = True
                
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
