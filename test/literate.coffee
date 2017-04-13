suite 'Literate Formatting', ->

  test 'jashkenas/coffee-script: src/scope.litcoffee', ->
    litcoffee = "#{fs.readFileSync 'test/scope.litcoffee'}"
    parse litcoffee, literate: yes

