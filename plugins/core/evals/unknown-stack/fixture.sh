#!/bin/sh
# evals/fixtures/makefile.sh: a project no detector knows, with a Makefile test target.
set -eu
git init -q -b main
cat > Makefile <<'EOF'
test:
	sh tests/run.sh
EOF
mkdir -p src tests
cat > src/greet.sh <<'EOF'
#!/bin/sh
echo "Helo, $1"
EOF
cat > tests/run.sh <<'EOF'
#!/bin/sh
out="$(sh src/greet.sh World)"
[ "$out" = "Hello, World" ] || { echo "expected 'Hello, World', got '$out'"; exit 1; }
echo ok
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: makefile project with a failing test"
git log -1 --oneline
