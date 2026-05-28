#!/bin/bash
# SoloFlow Code Review Automation

echo "=== SoloFlow Code Review ==="
echo ""

# Check for common issues
echo "1. Checking for common issues..."

# Check for TODO comments
TODO_COUNT=$(grep -r "TODO" hermes-plugin/ --include="*.py" | wc -l)
echo "   TODO comments: $TODO_COUNT"

# Check for FIXME comments
FIXME_COUNT=$(grep -r "FIXME" hermes-plugin/ --include="*.py" | wc -l)
echo "   FIXME comments: $FIXME_COUNT"

# Check for print statements (should use logging)
PRINT_COUNT=$(grep -r "print(" hermes-plugin/ --include="*.py" | grep -v "test" | wc -l)
echo "   Print statements: $PRINT_COUNT"

# Check for hardcoded values
HARDCODED_COUNT=$(grep -r "=[\"'][^\"']*[\"']" hermes-plugin/ --include="*.py" | grep -v "test" | wc -l)
echo "   Hardcoded strings: $HARDCODED_COUNT"

# Check for long functions
echo ""
echo "2. Checking for long functions..."
python -c "
import ast
import os

def check_function_length(filepath):
    with open(filepath, 'r') as f:
        tree = ast.parse(f.read())
    
    long_functions = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if hasattr(node, 'end_lineno') and node.end_lineno:
                length = node.end_lineno - node.lineno
                if length > 50:
                    long_functions.append((filepath, node.lineno, node.name, length))
    
    return long_functions

files = []
for root, dirs, filenames in os.walk('hermes-plugin'):
    for filename in filenames:
        if filename.endswith('.py') and '__pycache__' not in root:
            files.append(os.path.join(root, filename))

total_long = 0
for filepath in files:
    long_functions = check_function_length(filepath)
    if long_functions:
        print(f'\n{filepath}:')
        for filepath, line, name, length in long_functions:
            print(f'  {name}() at line {line}: {length} lines')
        total_long += len(long_functions)

print(f'\nTotal long functions (>50 lines): {total_long}')
"

echo ""
echo "=== Code Review Complete ==="
