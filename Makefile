default: all

# TODO: get somebody with some Makefile experience to help with this shit

SRC = $(shell find src -name "*.coffee" -type f | sort)
LIB = $(shell find lib -name "*.js" -type f | sort)
TESTS = $(shell find test -name "*.coffee" -type f | sort)

COFFEE = node_modules/coffee-script/bin/coffee
PEGJS = node_modules/pegjs/bin/pegjs --track-line-and-column --cache
MOCHA = node_modules/mocha/bin/mocha --compilers coffee:coffee-script -u tdd

all: build test

build: parser $(SRC) lib/coffee-script
	$(COFFEE) -o lib/coffee-script/ -c src/

parser: src/grammar.pegjs lib/coffee-script
	echo -n "module.exports = " > lib/coffee-script/parser.js
	$(PEGJS) < src/grammar.pegjs >> lib/coffee-script/parser.js

lib/coffee-script:
	mkdir -p lib/coffee-script/

test: $(LIB) $(TEST)
	$(MOCHA) -R spec

install: $(LIB)
	npm install -g .

coverage: build
	@which jscoverage || (echo "install node-jscoverage"; exit 1)
	rm -rf instrumented
	jscoverage -v lib instrumented
	$(MOCHA) -R dot
	$(MOCHA) -r instrumented/coffee-script/preprocessor -r instrumented/coffee-script/nodes -r instrumented/coffee-script/optimiser -R html-cov > coverage.html
	@xdg-open coverage.html &> /dev/null

clean:
	rm -rf instrumented
	rm coverage.html

.PHONY: test coverage clean install
