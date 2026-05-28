"""Structured output validation for SoloFlow.

Implements PydanticAI-style typed contracts:
- Define output schemas
- Validate LLM outputs
- Retry on validation failure
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Type

logger = logging.getLogger("soloflow.output")


@dataclass
class OutputSchema:
    """Defines expected output structure."""
    
    name: str
    description: str
    fields: dict[str, dict] = field(default_factory=dict)
    required: list[str] = field(default_factory=list)
    
    def validate(self, data: dict) -> tuple[bool, list[str]]:
        """Validate data against schema.
        
        Returns:
            (is_valid, list_of_errors)
        """
        errors = []
        
        # Check required fields
        for field_name in self.required:
            if field_name not in data:
                errors.append(f"Missing required field: {field_name}")
        
        # Check field types
        for field_name, field_spec in self.fields.items():
            if field_name in data:
                expected_type = field_spec.get("type")
                if expected_type and not self._check_type(data[field_name], expected_type):
                    errors.append(f"Field '{field_name}' expected {expected_type}, got {type(data[field_name]).__name__}")
        
        return len(errors) == 0, errors
    
    def _check_type(self, value: Any, expected_type: str) -> bool:
        """Check if value matches expected type."""
        type_map = {
            "string": str,
            "integer": int,
            "float": float,
            "boolean": bool,
            "array": list,
            "object": dict,
        }
        
        expected = type_map.get(expected_type)
        if not expected:
            return True  # Unknown type, skip check
        
        return isinstance(value, expected)
    
    def to_json_schema(self) -> dict:
        """Convert to JSON Schema format."""
        return {
            "type": "object",
            "properties": self.fields,
            "required": self.required,
        }


@dataclass
class ValidationResult:
    """Result of output validation."""
    
    is_valid: bool
    data: dict
    errors: list[str] = field(default_factory=list)
    attempts: int = 1
    
    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "data": self.data,
            "errors": self.errors,
            "attempts": self.attempts,
        }


class OutputValidator:
    """Validates LLM outputs against schemas.
    
    Key pattern from PydanticAI:
    - Define schema first (typed contract)
    - Validate output against schema
    - Retry with error feedback on failure
    """
    
    def __init__(self) -> None:
        self._schemas: dict[str, OutputSchema] = {}
    
    def register_schema(self, schema: OutputSchema) -> None:
        """Register an output schema."""
        self._schemas[schema.name] = schema
    
    def get_schema(self, name: str) -> Optional[OutputSchema]:
        """Get a schema by name."""
        return self._schemas.get(name)
    
    def validate(
        self,
        schema_name: str,
        data: dict,
    ) -> ValidationResult:
        """Validate data against a schema."""
        schema = self._schemas.get(schema_name)
        if not schema:
            return ValidationResult(
                is_valid=False,
                data=data,
                errors=[f"Schema '{schema_name}' not found"],
            )
        
        is_valid, errors = schema.validate(data)
        
        return ValidationResult(
            is_valid=is_valid,
            data=data,
            errors=errors,
        )
    
    def validate_with_retry(
        self,
        schema_name: str,
        data: dict,
        retry_fn: Callable[[list[str]], dict],
        max_retries: int = 3,
    ) -> ValidationResult:
        """Validate with automatic retry on failure.
        
        Key pattern from PydanticAI:
        - On validation failure, send errors back to LLM
        - LLM retries with error feedback
        - Repeat until valid or max retries
        """
        result = self.validate(schema_name, data)
        attempts = 1
        
        while not result.is_valid and attempts < max_retries:
            # Get error feedback for retry
            errors = result.errors
            
            # Call retry function with errors
            data = retry_fn(errors)
            attempts += 1
            
            # Re-validate
            result = self.validate(schema_name, data)
            result.attempts = attempts
        
        return result
    
    def list_schemas(self) -> list[dict]:
        """List all registered schemas."""
        return [
            {
                "name": schema.name,
                "description": schema.description,
                "fields": list(schema.fields.keys()),
                "required": schema.required,
            }
            for schema in self._schemas.values()
        ]


# Common output schemas
WORKFLOW_RESULT_SCHEMA = OutputSchema(
    name="workflow_result",
    description="Result of a workflow execution",
    fields={
        "status": {"type": "string", "description": "success or failure"},
        "result": {"type": "object", "description": "Execution result"},
        "errors": {"type": "array", "description": "List of errors"},
        "duration_ms": {"type": "integer", "description": "Execution time"},
    },
    required=["status"],
)

STEP_RESULT_SCHEMA = OutputSchema(
    name="step_result",
    description="Result of a single step execution",
    fields={
        "step_id": {"type": "string", "description": "Step identifier"},
        "status": {"type": "string", "description": "success or failure"},
        "output": {"type": "string", "description": "Step output"},
        "token_usage": {"type": "object", "description": "Token usage stats"},
    },
    required=["step_id", "status"],
)

REVIEW_DECISION_SCHEMA = OutputSchema(
    name="review_decision",
    description="Decision from a review step",
    fields={
        "decision": {"type": "string", "description": "approve, reject, or revise"},
        "confidence": {"type": "float", "description": "Confidence 0.0-1.0"},
        "reasoning": {"type": "string", "description": "Decision reasoning"},
        "suggestions": {"type": "array", "description": "Improvement suggestions"},
    },
    required=["decision", "reasoning"],
)
