suite 'William Shakespeare', ->

  test 'Hamlet', ->
    CoffeeScript.parse '''
      To be or not to be, that is the question
      Whether tis Nobler in the mind to suffer
      The Slings and Arrows of outrageous Fortune,
      Or to take Arms against a Sea of troubles,
      And By opposing end them, to die, to sleep
      No more. and By a sleep, to say we end
      The heart-ache and the thousand Natural shocks
      That Flesh is heir to?
    '''
