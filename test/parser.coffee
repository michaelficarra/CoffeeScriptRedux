suite 'Parser', ->

  setup ->
    @shouldParse = (input, done) ->
      doesNotThrow -> parse input, -> do done
    @shouldNotParse = (input, done) ->
      throws -> parse input, ->
      do done


  test 'empty program', (done) -> @shouldParse '', done
  test 'simple number', (done) -> @shouldParse '0', done

  test 'simple error', (done) -> @shouldNotParse '0+', done

  test 'deeply nested expressions', (done) ->
    @shouldParse '(((((((((((((((((((((((((0)))))))))))))))))))))))))', done
