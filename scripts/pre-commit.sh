#!/bin/bash
# pre-commit hook: syntax check JS/TS/PY/SH files + verify AGENTS.md lessons
# Install: cp scripts/pre-commit.sh .git/hooks/pre-commit

STAGED_JS=$(git diff --cached --name-only --diff-filter=ACM -- '*.js' '*.ts' '*.mjs')
STAGED_PY=$(git diff --cached --name-only --diff-filter=ACM -- '*.py')
STAGED_SH=$(git diff --cached --name-only --diff-filter=ACM -- '*.sh')

FAILED=0

for f in $STAGED_JS; do
  if [ -f "$f" ]; then
    echo "Checking JS syntax: $f"
    node --check "$f" || FAILED=1
  fi
done

for f in $STAGED_PY; do
  if [ -f "$f" ]; then
    echo "Checking Python syntax: $f"
    python -m py_compile "$f" || FAILED=1
  fi
done

for f in $STAGED_SH; do
  if [ -f "$f" ]; then
    echo "Checking shell syntax: $f"
    bash -n "$f" || FAILED=1
  fi
done

if [ ! -f AGENTS.md ]; then
  echo "WARNING: AGENTS.md is missing"
fi

LESSON_COUNT=$(grep -c "^### Lesson" AGENTS.md 2>/dev/null || echo 0)
if [ "$LESSON_COUNT" -lt 1 ]; then
  echo "WARNING: AGENTS.md has no failure lessons documented"
fi

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "COMMIT BLOCKED: Syntax errors found. Fix them and try again."
  echo "If this is a new failure, add a lesson to AGENTS.md before fixing."
  exit 1
fi

exit 0