"""
Comprehensive mock for Smartsheet Python SDK
"""
from unittest.mock import Mock, MagicMock
from typing import Dict, List, Any, Optional, Union
import json
from datetime import datetime

class MockSmartsheetClient:
    """Comprehensive mock of the Smartsheet client"""
    
    def __init__(self):
        self.Sheets = MockSheetsResource()
        self.Workspaces = MockWorkspacesResource()
        self.Discussions = MockDiscussionsResource()
        self.Attachments = MockAttachmentsResource()
        self.Reports = MockReportsResource()
        self.Folders = MockFoldersResource()
        self.Users = MockUsersResource()

class MockSheetsResource:
    """Mock for Smartsheet Sheets resource"""
    
    def __init__(self):
        self._sheets_db = {}
        self._next_id = 1000000000000000
        
    def get_sheet(self, sheet_id: Union[str, int], include: Optional[str] = None):
        """Mock get_sheet method"""
        sheet_id = str(sheet_id)
        
        if sheet_id not in self._sheets_db:
            # Create default test sheet
            self._sheets_db[sheet_id] = self._create_default_sheet(sheet_id)
            
        sheet = self._sheets_db[sheet_id]
        
        # Create mock response
        mock_sheet = Mock()
        mock_sheet.id = int(sheet_id)
        mock_sheet.name = sheet['name']
        mock_sheet.columns = [self._create_mock_column(col) for col in sheet['columns']]
        mock_sheet.rows = [self._create_mock_row(row) for row in sheet['rows']]
        mock_sheet.permalink = f"https://app.smartsheet.com/sheets/{sheet_id}"
        
        return mock_sheet
    
    def list_sheets(self, include_all: bool = False):
        """Mock list_sheets method"""
        mock_result = Mock()
        mock_result.data = [
            self._create_mock_sheet_summary('1234567890123456', 'Test Sheet 1'),
            self._create_mock_sheet_summary('2234567890123456', 'Test Sheet 2'),
            self._create_mock_sheet_summary('3234567890123456', 'Target Sheet'),
        ]
        return mock_result
    
    def add_rows(self, sheet_id: Union[str, int], rows: List[Any]):
        """Mock add_rows method"""
        mock_result = Mock()
        mock_result.result = [
            self._create_mock_row({'id': self._next_id + i, 'cells': []}) 
            for i in range(len(rows))
        ]
        return mock_result
    
    def update_rows(self, sheet_id: Union[str, int], rows: List[Any]):
        """Mock update_rows method"""
        mock_result = Mock()
        mock_result.result = [
            self._create_mock_row({'id': getattr(row, 'id', self._next_id), 'cells': []}) 
            for row in rows
        ]
        return mock_result
    
    def delete_rows(self, sheet_id: Union[str, int], row_ids: List[int]):
        """Mock delete_rows method"""
        mock_result = Mock()
        mock_result.result = row_ids  # Return the deleted row IDs
        return mock_result
    
    def add_columns(self, sheet_id: Union[str, int], columns: List[Any]):
        """Mock add_columns method"""
        mock_result = Mock()
        mock_result.result = [
            self._create_mock_column({
                'id': self._next_id, 
                'title': getattr(col, 'title', 'New Column'),
                'type': getattr(col, 'type', 'TEXT_NUMBER'),
                'index': 0
            })
            for col in columns
        ]
        return mock_result
    
    def delete_column(self, sheet_id: Union[str, int], column_id: Union[str, int]):
        """Mock delete_column method"""
        mock_result = Mock()
        mock_result.message = "SUCCESS"
        return mock_result
    
    def update_column(self, sheet_id: Union[str, int], column: Any):
        """Mock update_column method"""
        mock_result = Mock()
        mock_result.result = self._create_mock_column({
            'id': getattr(column, 'id', self._next_id),
            'title': getattr(column, 'title', 'Updated Column'),
            'type': 'TEXT_NUMBER',
            'index': 0
        })
        return mock_result
    
    def get_column(self, sheet_id: Union[str, int], column_id: Union[str, int]):
        """Mock get_column method"""
        return self._create_mock_column({
            'id': int(column_id),
            'title': 'Test Column',
            'type': 'TEXT_NUMBER',
            'index': 0
        })
    
    def _create_default_sheet(self, sheet_id: str) -> Dict[str, Any]:
        """Create a default test sheet"""
        return {
            'id': sheet_id,
            'name': 'Test Sheet',
            'columns': [
                {
                    'id': '7777777777777777',
                    'title': 'Task Name',
                    'type': 'TEXT_NUMBER',
                    'primary': True,
                    'index': 0
                },
                {
                    'id': '8888888888888888',
                    'title': 'Status',
                    'type': 'PICKLIST',
                    'options': ['Not Started', 'In Progress', 'Complete'],
                    'index': 1
                }
            ],
            'rows': [
                {
                    'id': '5555555555555555',
                    'cells': [
                        {'columnId': '7777777777777777', 'value': 'Test Task', 'formula': None},
                        {'columnId': '8888888888888888', 'value': 'In Progress', 'formula': None}
                    ]
                }
            ]
        }
    
    def _create_mock_sheet_summary(self, sheet_id: str, name: str):
        """Create mock sheet summary"""
        mock_summary = Mock()
        mock_summary.id = int(sheet_id)
        mock_summary.name = name
        mock_summary.permalink = f"https://app.smartsheet.com/sheets/{sheet_id}"
        return mock_summary
    
    def _create_mock_column(self, col_data: Dict[str, Any]):
        """Create mock column object"""
        mock_col = Mock()
        mock_col.id = int(col_data['id'])
        mock_col.title = col_data['title']
        mock_col.type = col_data['type']
        mock_col.index = col_data['index']
        mock_col.primary = col_data.get('primary', False)
        mock_col.options = col_data.get('options', [])
        return mock_col
    
    def _create_mock_row(self, row_data: Dict[str, Any]):
        """Create mock row object"""
        mock_row = Mock()
        mock_row.id = int(row_data['id'])
        mock_row.cells = [self._create_mock_cell(cell) for cell in row_data['cells']]
        return mock_row
    
    def _create_mock_cell(self, cell_data: Dict[str, Any]):
        """Create mock cell object"""
        mock_cell = Mock()
        mock_cell.column_id = int(cell_data['columnId'])
        mock_cell.value = cell_data.get('value')
        mock_cell.formula = cell_data.get('formula')
        return mock_cell

class MockWorkspacesResource:
    """Mock for Smartsheet Workspaces resource"""
    
    def list_workspaces(self, include_all: bool = False):
        """Mock list_workspaces method"""
        mock_result = Mock()
        mock_result.data = [
            self._create_mock_workspace('9876543210987654', 'Test Workspace'),
            self._create_mock_workspace('8876543210987654', 'Healthcare Workspace'),
        ]
        return mock_result
    
    def get_workspace(self, workspace_id: Union[str, int], include: Optional[str] = None):
        """Mock get_workspace method"""
        mock_workspace = Mock()
        mock_workspace.id = int(workspace_id)
        mock_workspace.name = 'Test Workspace'
        mock_workspace.sheets = [
            Mock(id=1234567890123456, name='Sheet 1'),
            Mock(id=2234567890123456, name='Sheet 2')
        ]
        return mock_workspace
    
    def create_workspace(self, workspace: Any):
        """Mock create_workspace method"""
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.id = 9999999999999999
        mock_result.result.name = getattr(workspace, 'name', 'New Workspace')
        return mock_result
    
    def _create_mock_workspace(self, workspace_id: str, name: str):
        """Create mock workspace summary"""
        mock_workspace = Mock()
        mock_workspace.id = int(workspace_id)
        mock_workspace.name = name
        return mock_workspace

class MockDiscussionsResource:
    """Mock for Smartsheet Discussions resource"""
    
    def create_discussion_on_sheet(self, sheet_id: Union[str, int], comment: Any):
        """Mock create_discussion_on_sheet method"""
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.id = 1111111111111111
        mock_result.result.title = getattr(comment, 'text', 'Discussion')[:50]
        mock_result.result.comment_count = 1
        mock_result.result.created_at = datetime.now()
        mock_result.result.created_by = Mock(email='test@example.com')
        return mock_result
    
    def create_discussion_on_row(self, sheet_id: Union[str, int], row_id: Union[str, int], comment: Any):
        """Mock create_discussion_on_row method"""
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.id = 1111111111111112
        mock_result.result.title = getattr(comment, 'text', 'Row Discussion')[:50]
        mock_result.result.comment_count = 1
        mock_result.result.created_at = datetime.now()
        mock_result.result.created_by = Mock(email='test@example.com')
        return mock_result
    
    def add_discussion_comment(self, sheet_id: Union[str, int], discussion_id: Union[str, int], comment: Any):
        """Mock add_discussion_comment method"""
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.id = 2222222222222222
        mock_result.result.text = getattr(comment, 'text', 'Test comment')
        mock_result.result.created_at = datetime.now()
        mock_result.result.created_by = Mock(email='test@example.com')
        return mock_result
    
    def get_discussion(self, sheet_id: Union[str, int], discussion_id: Union[str, int]):
        """Mock get_discussion method"""
        mock_discussion = Mock()
        mock_discussion.id = int(discussion_id)
        mock_discussion.title = 'Test Discussion'
        mock_discussion.comment_count = 2
        mock_discussion.comments = [
            Mock(id=2222222222222222, text='First comment', created_by=Mock(email='test@example.com')),
            Mock(id=2222222222222223, text='Second comment', created_by=Mock(email='user@example.com'))
        ]
        return mock_discussion
    
    def get_all_discussions(self, sheet_id: Union[str, int], include: Optional[str] = None):
        """Mock get_all_discussions method"""
        mock_result = Mock()
        mock_result.data = [
            Mock(id=1111111111111111, title='Discussion 1', comment_count=2),
            Mock(id=1111111111111112, title='Discussion 2', comment_count=1)
        ]
        return mock_result

class MockAttachmentsResource:
    """Mock for Smartsheet Attachments resource"""
    
    def attach_file_to_sheet(self, sheet_id: Union[str, int], file_path: str, file_name: Optional[str] = None):
        """Mock attach_file_to_sheet method"""
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.id = 3333333333333333
        mock_result.result.name = file_name or 'test_file.pdf'
        mock_result.result.url = f'https://smartsheet.com/attachments/{mock_result.result.id}'
        mock_result.result.attachmentType = 'FILE'
        mock_result.result.sizeInKb = 1024
        return mock_result
    
    def attach_file_to_row(self, sheet_id: Union[str, int], row_id: Union[str, int], file_path: str, file_name: Optional[str] = None):
        """Mock attach_file_to_row method"""
        mock_result = Mock()
        mock_result.result = Mock()
        mock_result.result.id = 3333333333333334
        mock_result.result.name = file_name or 'test_file.pdf'
        mock_result.result.parentId = int(row_id)
        return mock_result
    
    def list_row_attachments(self, sheet_id: Union[str, int], row_id: Union[str, int]):
        """Mock list_row_attachments method"""
        mock_result = Mock()
        mock_result.data = [
            Mock(id=3333333333333334, name='attachment1.pdf', sizeInKb=1024),
            Mock(id=3333333333333335, name='attachment2.docx', sizeInKb=2048)
        ]
        return mock_result
    
    def list_sheet_attachments(self, sheet_id: Union[str, int]):
        """Mock list_sheet_attachments method"""
        mock_result = Mock()
        mock_result.data = [
            Mock(id=3333333333333333, name='sheet_attachment.pdf', sizeInKb=512)
        ]
        return mock_result
    
    def get_attachment(self, sheet_id: Union[str, int], attachment_id: Union[str, int]):
        """Mock get_attachment method"""
        mock_attachment = Mock()
        mock_attachment.id = int(attachment_id)
        mock_attachment.name = 'test_attachment.pdf'
        mock_attachment.url = f'https://smartsheet.com/attachments/{attachment_id}'
        mock_attachment.sizeInKb = 1024
        return mock_attachment
    
    def delete_attachment(self, sheet_id: Union[str, int], attachment_id: Union[str, int]):
        """Mock delete_attachment method"""
        mock_result = Mock()
        mock_result.message = "SUCCESS"
        return mock_result

class MockReportsResource:
    """Mock for Smartsheet Reports resource"""
    
    def get_report(self, report_id: Union[str, int]):
        """Mock get_report method"""
        mock_report = Mock()
        mock_report.id = int(report_id)
        mock_report.name = 'Test Report'
        return mock_report

class MockFoldersResource:
    """Mock for Smartsheet Folders resource"""
    pass

class MockUsersResource:
    """Mock for Smartsheet Users resource"""
    
    def get_current_user(self):
        """Mock get_current_user method"""
        mock_user = Mock()
        mock_user.email = 'test@example.com'
        mock_user.firstName = 'Test'
        mock_user.lastName = 'User'
        return mock_user

def create_mock_smartsheet_models():
    """Create mock Smartsheet models module"""
    models = Mock()
    
    # Mock model classes
    models.Sheet = Mock
    models.Row = Mock
    models.Cell = Mock  
    models.Column = Mock
    models.Comment = Mock
    models.Discussion = Mock
    models.Attachment = Mock
    models.Workspace = Mock
    
    return models