#!/bin/bash
# SoloFlow Documentation Generator

echo "=== SoloFlow Documentation Generator ==="
echo ""

# Generate API documentation
echo "1. Generating API documentation..."
python -c "
import ast
import os

def extract_docstrings(filepath):
    with open(filepath, 'r') as f:
        tree = ast.parse(f.read())
    
    docstrings = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            docstring = ast.get_docstring(node)
            if docstring:
                docstrings.append({
                    'name': node.name,
                    'docstring': docstring[:100] + '...' if len(docstring) > 100 else docstring,
                    'line': node.lineno,
                })
    
    return docstrings

files = []
for root, dirs, filenames in os.walk('hermes-plugin'):
    for filename in filenames:
        if filename.endswith('.py') and '__pycache__' not in root:
            files.append(os.path.join(root, filename))

total_docstrings = 0
for filepath in files:
    docstrings = extract_docstrings(filepath)
    if docstrings:
        print(f'\n{filepath}:')
        for ds in docstrings[:3]:
            print(f'  {ds[\"name\"]}(): {ds[\"docstring\"]}')
        total_docstrings += len(docstrings)

print(f'\nTotal documented functions: {total_docstrings}')
"

echo ""
echo "=== Documentation Generation Complete ==="
