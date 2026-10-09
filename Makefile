.PHONY: all test package install-host switch-chromium switch-firefox clean run-server

all: test

test:
	@./build.sh test

package:
	@./build.sh package

install-host:
	@./build.sh install-host

switch-chromium:
	@./build.sh switch-chromium

switch-firefox:
	@./build.sh switch-firefox

run-server:
	@python3 native-host/fzl_buku_server.py

clean:
	@rm -rf dist/
	@find . -name "*.pyc" -delete
	@find . -name "__pycache__" -delete
