#!/bin/bash
# SoloFlow Health Check Script

echo "=== SoloFlow Health Check ==="
echo ""

# Run tests
echo "1. Running tests..."
python -m pytest tests/ -q
if [ $? -eq 0 ]; then
    echo "   ✅ All tests pass"
else
    echo "   ❌ Tests failed"
    exit 1
fi

# Check type hints
echo ""
echo "2. Checking type hints..."
python -c "
import ast
import os

def check_type_hints(filepath):
    with open(filepath, 'r') as f:
        tree = ast.parse(f.read())
    
    functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    annotated = sum(1 for f in functions if f.returns is not None)
    
    return annotated, len(functions)

files = []
for root, dirs, filenames in os.walk('hermes-plugin'):
    for filename in filenames:
        if filename.endswith('.py') and '__pycache__' not in root:
            files.append(os.path.join(root, filename))

total_annotated = 0
total_functions = 0

for filepath in files:
    try:
        annotated, functions = check_type_hints(filepath)
        total_annotated += annotated
        total_functions += functions
    except Exception as e:
        pass

if total_functions > 0:
    coverage = total_annotated / total_functions * 100
    print(f'   Type hint coverage: {coverage:.1f}%')
    if coverage >= 90:
        print('   ✅ Good coverage')
    else:
        print('   ⚠️  Consider adding more type hints')
else:
    print('   No functions found')
"

# Check docstrings
echo ""
echo "3. Checking docstrings..."
python -c "
import ast
import os

def check_docstrings(filepath):
    with open(filepath, 'r') as f:
        tree = ast.parse(f.read())
    
    functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    documented = sum(1 for f in functions if ast.get_docstring(f))
    
    return documented, len(functions)

files = []
for root, dirs, filenames in os.walk('hermes-plugin'):
    for filename in filenames:
        if filename.endswith('.py') and '__pycache__' not in root:
            files.append(os.path.join(root, filename))

total_documented = 0
total_functions = 0

for filepath in files:
    try:
        documented, functions = check_docstrings(filepath)
        total_documented += documented
        total_functions += functions
    except Exception as e:
        pass

if total_functions > 0:
    coverage = total_documented / total_functions * 100
    print(f'   Docstring coverage: {coverage:.1f}%')
    if coverage >= 80:
        print('   ✅ Good coverage')
    else:
        print('   ⚠️  Consider adding more docstrings')
else:
    print('   No functions found')
"

echo ""
echo "=== Health Check Complete ==="
