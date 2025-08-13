"""
pytest configuration and fixtures for smartsheet_ops tests
"""
import os
import pytest
from unittest.mock import Mock, MagicMock
from typing import Dict, Any

# Set up test environment
os.environ['NODE_ENV'] = 'test'
os.environ['SMARTSHEET_API_KEY'] = 'test-api-key'
os.environ['AZURE_OPENAI_API_KEY'] = 'test-azure-key'
os.environ['AZURE_OPENAI_API_BASE'] = 'https://test.openai.azure.com'
os.environ['AZURE_OPENAI_API_VERSION'] = '2024-02-15-preview'
os.environ['AZURE_OPENAI_DEPLOYMENT'] = 'test-deployment'

@pytest.fixture
def mock_api_key():
    """Provide a test API key"""
    return 'test-api-key-12345'

@pytest.fixture
def mock_sheet_id():
    """Provide a test sheet ID"""
    return '1234567890123456'

@pytest.fixture
def mock_workspace_id():
    """Provide a test workspace ID"""
    return '9876543210987654'

@pytest.fixture
def mock_row_id():
    """Provide a test row ID"""
    return '5555555555555555'

@pytest.fixture
def mock_column_id():
    """Provide a test column ID"""
    return '7777777777777777'

@pytest.fixture
def mock_smartsheet_client():
    """Create a mock Smartsheet client"""
    client = Mock()
    
    # Mock the main client properties
    client.Sheets = Mock()
    client.Workspaces = Mock()
    client.Discussions = Mock()
    client.Attachments = Mock()
    client.Reports = Mock()
    
    return client

@pytest.fixture
def sample_sheet_data():
    """Provide sample sheet data for testing"""
    return {
        'id': 1234567890123456,
        'name': 'Test Sheet',
        'columns': [
            {
                'id': 7777777777777777,
                'title': 'Task Name',
                'type': 'TEXT_NUMBER',
                'primary': True,
                'index': 0
            },
            {
                'id': 8888888888888888,
                'title': 'Status',
                'type': 'PICKLIST',
                'options': ['Not Started', 'In Progress', 'Complete'],
                'index': 1
            },
            {
                'id': 9999999999999999,
                'title': 'Due Date',
                'type': 'DATE',
                'index': 2
            }
        ],
        'rows': [
            {
                'id': 5555555555555555,
                'cells': [
                    {'columnId': 7777777777777777, 'value': 'Task 1'},
                    {'columnId': 8888888888888888, 'value': 'In Progress'},
                    {'columnId': 9999999999999999, 'value': '2024-01-15'}
                ]
            },
            {
                'id': 6666666666666666,
                'cells': [
                    {'columnId': 7777777777777777, 'value': 'Task 2'},
                    {'columnId': 8888888888888888, 'value': 'Complete'},
                    {'columnId': 9999999999999999, 'value': '2024-01-10'}
                ]
            }
        ]
    }

@pytest.fixture
def sample_cross_reference_data():
    """Provide sample cross-reference data for testing"""
    return {
        'sheet_id': '1234567890123456',
        'sheet_name': 'Source Sheet',
        'total_references': 2,
        'cross_references': [
            {
                'row_id': '5555555555555555',
                'column_id': '7777777777777777',
                'column_title': 'Referenced Value',
                'reference': '[Target Sheet]Column1',
                'referenced_sheet_name': 'Target Sheet',
                'formula': '=INDEX({[Target Sheet]Column1:Column1}, MATCH([ID]@row, {[Target Sheet]ID:ID}, 0))',
                'cell_value': 'Result Value'
            }
        ]
    }

@pytest.fixture
def sample_discussion_data():
    """Provide sample discussion data for testing"""
    return {
        'id': 1111111111111111,
        'title': 'Test Discussion',
        'comment_count': 2,
        'comments': [
            {
                'id': 2222222222222222,
                'text': 'This is a test comment',
                'created_by': {'email': 'test@example.com'},
                'created_at': '2024-01-15T10:00:00Z'
            }
        ]
    }

@pytest.fixture
def sample_attachment_data():
    """Provide sample attachment data for testing"""
    return {
        'id': 3333333333333333,
        'name': 'test_file.pdf',
        'url': 'https://smartsheet.com/attachments/test_file.pdf',
        'attachmentType': 'FILE',
        'createdBy': {'email': 'test@example.com'},
        'createdAt': '2024-01-15T10:00:00Z',
        'sizeInKb': 1024
    }

@pytest.fixture
def mock_operations_success_response():
    """Standard success response for operations"""
    def _create_response(result_data: Dict[str, Any]) -> Dict[str, Any]:
        mock_result = Mock()
        mock_result.result = result_data
        return mock_result
    return _create_response

@pytest.fixture(autouse=True)
def suppress_logs(caplog):
    """Suppress logs during testing unless explicitly needed"""
    caplog.set_level(40)  # ERROR level
    return caplog