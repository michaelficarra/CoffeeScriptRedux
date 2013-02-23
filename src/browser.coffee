module.exports = CoffeeScript = require './module'

# Use standard JavaScript `eval` to eval code.
CoffeeScript.eval = (code, options = {}) ->
  options.bare ?= on
  options.optimise ?= on
  eval CoffeeScript.cs2js code, options

# Running code does not provide access to this scope.
CoffeeScript.run = (code, options = {}) ->
  options.bare = on
  options.optimise ?= on
  do Function CoffeeScript.cs2js code, options

# Load a remote script from the current domain via XHR.
CoffeeScript.load = (url, callback) ->
  xhr = if window.ActiveXObject
    new window.ActiveXObject 'Microsoft.XMLHTTP'
  else
    new XMLHttpRequest
  xhr.open 'GET', url, true
  xhr.overrideMimeType 'text/plain' if 'overrideMimeType' of xhr
  xhr.onreadystatechange = ->
    return unless xhr.readyState is xhr.DONE
    if xhr.status in [0, 200]
      CoffeeScript.run xhr.responseText
    else
      throw new Error "Could not load #{url}"
    do callback if callback
  xhr.send null

# Activate CoffeeScript in the browser by having it compile and evaluate
# all script tags with a content-type of `text/coffeescript`.
# This happens on page load.
runScripts = ->
  scripts = document.getElementsByTagName 'script'
  coffees = (s for s in scripts when s.type is 'text/coffeescript')
  index = 0
  do execute = ->
    return unless script = coffees[index++]
    if script.src
      CoffeeScript.load script.src, execute
    else
      CoffeeScript.run script.innerHTML
      do execute
  null

# Listen for window load, both in browsers and in IE.
if addEventListener?
  addEventListener 'DOMContentLoaded', runScripts, no
else if attachEvent?
  attachEvent 'onload', runScripts
