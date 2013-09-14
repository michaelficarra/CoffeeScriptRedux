    cluster = require 'cluster'

    if cluster.isMaster
      cluster.once 'exit', (worker, code) ->
        process.exit code
        return
      cluster.fork()
    else
      process.exit 0
