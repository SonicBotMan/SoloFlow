"""Tests for structured output validation."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from output import OutputSchema, OutputValidator, ValidationResult


@pytest.fixture
def validator():
    v = OutputValidator()
    schema = OutputSchema(
        name="test_schema",
        description="Test schema",
        fields={
            "name": {"type": "string"},
            "age": {"type": "integer"},
        },
        required=["name"],
    )
    v.register_schema(schema)
    return v


class TestOutputSchema:
    def test_validate_valid(self):
        schema = OutputSchema(
            name="test",
            description="Test",
            fields={"name": {"type": "string"}},
            required=["name"],
        )
        is_valid, errors = schema.validate({"name": "Alice"})
        assert is_valid is True
        assert len(errors) == 0
    
    def test_validate_missing_required(self):
        schema = OutputSchema(
            name="test",
            description="Test",
            fields={"name": {"type": "string"}},
            required=["name"],
        )
        is_valid, errors = schema.validate({})
        assert is_valid is False
        assert "Missing required field" in errors[0]
    
    def test_validate_wrong_type(self):
        schema = OutputSchema(
            name="test",
            description="Test",
            fields={"age": {"type": "integer"}},
            required=["age"],
        )
        is_valid, errors = schema.validate({"age": "not a number"})
        assert is_valid is False
    
    def test_to_json_schema(self):
        schema = OutputSchema(
            name="test",
            description="Test",
            fields={"name": {"type": "string"}},
            required=["name"],
        )
        json_schema = schema.to_json_schema()
        assert json_schema["type"] == "object"
        assert "name" in json_schema["properties"]


class TestOutputValidator:
    def test_validate_valid(self, validator):
        result = validator.validate("test_schema", {"name": "Alice", "age": 30})
        assert result.is_valid is True
    
    def test_validate_invalid(self, validator):
        result = validator.validate("test_schema", {"age": "not a number"})
        assert result.is_valid is False
        assert len(result.errors) > 0
    
    def test_validate_unknown_schema(self, validator):
        result = validator.validate("nonexistent", {"name": "Alice"})
        assert result.is_valid is False
        assert "not found" in result.errors[0]
    
    def test_validate_with_retry(self, validator):
        call_count = 0
        
        def retry_fn(errors):
            nonlocal call_count
            call_count += 1
            return {"name": "Alice", "age": 30}
        
        result = validator.validate_with_retry(
            "test_schema",
            {"age": "invalid"},
            retry_fn,
            max_retries=3,
        )
        assert result.is_valid is True
        assert result.attempts == 2
        assert call_count == 1
    
    def test_list_schemas(self, validator):
        schemas = validator.list_schemas()
        assert len(schemas) == 1
        assert schemas[0]["name"] == "test_schema"
