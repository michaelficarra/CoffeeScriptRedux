exec = require('child_process').exec

suite 'Command line execution', ->

  test 'CLI options without any executable should be handled by CoffeeScript', (done) ->
    exec 'bin/coffee -v', (error, stdout, stderr) ->
      pkg = require './../package.json'
      ok(stdout.toString().indexOf "CoffeeScript version #{pkg.version}" is 0)

      done()


  test 'Known CLI options should be passed to script if executable was specified', (done) ->
    exec 'bin/coffee test/cli-files/cli-options.coffee -v', (error, stdout, stderr) ->
      eq stdout, 'test -v ok'

      done()

  test 'Unknown CLI options should be passed to script if executable was specified', (done) ->
    exec 'bin/coffee test/cli-files/cli-options.coffee -r', (error, stdout, stderr) ->
      eq stdout, 'test -r ok'

      done()
