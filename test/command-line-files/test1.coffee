console.log "test1 is main", module is require.main


exports.error = ->
  throw new Error("Test Error")
