(function() {
  var activate, activate_coffee2js, randomFrom, samples;
  samples = {
    coffee: [
      "# Type here!\n\nmath =\n  root:   Math.sqrt\n  square: square\n  cube:   (x) -> x * square x\n\nalert \"Three cubed is \#{math.cube 3}\"",
      "# Type here!\n\ndays =\n  monday: 1\n  tuesday: 2\n  wednesday: 3\n  thursday: 4\n  friday: 5\n  saturday: 6\n  sunday: 7\n  \nif yesterday is thursday\n  today = friday\n  we.excited()\n  we.have ball: today"
    ]
  };
  randomFrom = function(arr) {
    return arr[parseInt(Math.random() * arr.length)];
  };
  activate = function(id, options) {
    var CoffeeMode, JavaScriptMode, editor, s;
    editor = ace.edit(id);
    s = editor.getSession();
    editor.setTheme("ace/theme/clouds");
    if (options.type === "javascript") {
      JavaScriptMode = require("ace/mode/javascript").Mode;
      editor.getSession().setMode(new JavaScriptMode());
    } else if (options.type === "coffeescript") {
      CoffeeMode = require("ace/mode/coffee").Mode;
      editor.getSession().setMode(new CoffeeMode());
    }
    editor.getSession().setTabSize(options['tabSize'] || 4);
    editor.getSession().setUseSoftTabs(true);
    editor.renderer.setShowPrintMargin(false);
    editor.renderer.setHScrollBarAlwaysVisible(false);
    editor.renderer.setShowGutter(false);
    if (options.readonly) {
      editor.setReadOnly(true);
    }
    if (options.noActiveLine) {
      editor.setHighlightActiveLine(false);
    }
    return editor;
  };
  activate_coffee2js = function() {
    var editor, onchange, output;
    editor = activate("coffee2js_editor", {
      type: "coffeescript",
      tabSize: 2
    });
    output = activate("coffee2js_output", {
      type: "javascript",
      noActiveLine: true
    });
    output.setReadOnly(true);
    onchange = function() {
      var input, out, csAST, jsAST;
      input = editor.getSession().getValue();
      try {
        csAST = CoffeeScript.parse(input, {optimise: false, raw: false, inputSource: '(demo)'});
        jsAST = CoffeeScript.compile(csAST, {bare: false});
        out = CoffeeScript.js(jsAST, {compact: false});
        $("#coffee2js .error").hide();
        return output.getSession().setValue(out);
      } catch (e) {
        $("#coffee2js .error").text("" + e);
        return $("#coffee2js .error").show();
      }
    };
    editor.getSession().on("change", onchange);
    editor.getSession().setValue(randomFrom(samples.coffee));
    return onchange();
  };
  $("#tabs a").live("click", function() {
    var $form, target;
    target = $(this).attr("href").substr(1);
    $form = $("form#" + target);
    $("#editors form").hide();
    $("#" + target).show();
    if (target === 'coffee2js') {
      activate_coffee2js();
    }
    $("#" + target + " .editor textarea").focus();
    $("#tabs a").removeClass("active");
    $(this).addClass("active");
    return false;
  });
  $(window).resize(function() {
    var h;
    h = $(window).height() - 60;
    if (h < 500) {
      h = 500;
    }
    $("#editors").css({
      height: h
    });
    return $("#editors form").css({
      height: h
    });
  });
  $("p.more-info a").live('click', function() {
    $("body").animate({
      scrollTop: $("#info").offset().top - 10,
      1000: 1000
    });
    return false;
  });
  $(window).trigger('resize');
  $(function() {
    activate_coffee2js();
    $("#coffee2js .editor textarea").focus();
    return $(window).trigger('resize');
  });
}).call(this);
