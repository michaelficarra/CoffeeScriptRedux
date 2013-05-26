suite 'Literate Formatting', ->

  # This test passes in node 0.8, but has some infinite recursion issue outside this code in 0.10
  # So I've disabled it until the issue gets magically resolved at some point in the future
  #test 'jashkenas/coffee-script: src/scope.litcoffee', ->
  #  litcoffee = "#{fs.readFileSync 'test/scope.litcoffee'}"
  #  parse litcoffee, literate: yes
