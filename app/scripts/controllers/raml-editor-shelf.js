'use strict';

angular.module('ramlEditorApp')
  .factory('applySuggestion', function applySuggestionFactory(ramlHint, ramlSnippets, getLineIndent, generateTabs,
                                                              isArrayStarter, getNode) {
    return function applySuggestion(editor, suggestion) {
      var snippet         = ramlSnippets.getSnippet(suggestion);
      var node            = getNode(editor);
      var lineIsArray     = node.line.trim() === '-';
      var tabCount        = node.tabCount;

      //Need to compute a prefix, such as '- ' or ' ' for the snippet
      //as well as a padding for every line in the snippet. The padding
      //is simply the current node tabbing, or the cursor position if
      //there is no current node, which exactly what node.tabCount does:
      var prefix = lineIsArray ? ' ' : '';
      var padding = lineIsArray ? '' : generateTabs(tabCount);

      //For list element suggestions, we need to know whether or not to add the '- ' list
      //indicator: If a previous element at our tab depth already added the list indicator
      //then we should not do so.
      if (suggestion.isList && !lineIsArray) {
        var arrayStarterNode = node.selfOrPrevious(function(node) { return node.isArrayStarter; });
        //1. If we don't find and array starter node, we start a new array.
        //2. If we have an array starter node, BUT the cursor is at same tab as it, we start a new array.
        if (!arrayStarterNode || (node.tabCount === arrayStarterNode.tabCount && node.lineNum !== arrayStarterNode.lineNum)) {
          prefix = '- ';
        } else if (node.isArrayStarter) {
          //Add extra tab for children of root array node, e.g. those not prefixed with a '- '
          padding = generateTabs(tabCount + 1);
        }
      }

       // Add prefix and padding to snippet lines:
      var codeToInsert = snippet.map(function (line, index) {
        return padding + (index === 0 ? prefix : '') + line;
      }).join('\n');

      //Search for a line that is empty or has the same indentation as current line
      while(true) {
        if (node.isEmpty) {
          break; //Empty node, place code there
        }
        var nextNode = getNode(editor, node.lineNum + 1);
        if (!nextNode || nextNode.tabCount <= tabCount) {
          break; //At end of raml, place node here
        }
        node = nextNode;
      }

      //Calculate the place to insert the code:
      //+ Make sure to start at end of node content so we don't erase anything!
      var from = { line: node.lineNum, ch: node.line.trimRight().length };
      var to = { line: from.line, ch: node.line.length };
      var nodeHasContent = !node.isEmpty && !lineIsArray;

      // If cursor is on a non-empty/array starter line, add a newline:
      if (nodeHasContent) {
        codeToInsert = '\n' + codeToInsert;
      }

      editor.replaceRange(codeToInsert, from, to);

      // in case of inserting into current line we're
      // moving cursor one line less further as we're
      // re-using current line
      editor.setCursor({
        line: from.line + snippet.length - (nodeHasContent ? 0 : 1)
      });

      editor.focus();
    };
  })
  .value('suggestionKeyToTitleMapping', {
    '<resource>': 'New Resource'
  })
  .factory('updateSuggestions', function(ramlHint, suggestionKeyToTitleMapping) {
    return function (editor) {
      var suggestions = ramlHint.getSuggestions(editor);
      var sections    = {};
      var model       = {sections: []};

      suggestions.forEach(function (item) {
        item.title = suggestionKeyToTitleMapping[item.key] || item.key;

        sections[item.metadata.category] = sections[item.metadata.category] || {name: item.metadata.category, items: []};
        sections[item.metadata.category].items.push(item);
        //61553714: Because item is the model passed into the designer, we need to copy the
        //isList property into it so that the designer can format things properly.
        item.isList = suggestions.isList;
      });

      Object.keys(sections).forEach(function (key) {
        model.sections.push(sections[key]);
      });

      model.path = suggestions.path;
      return model;
    };
  })
  .controller('ramlEditorShelf', function ($scope, eventService, codeMirror, safeApply, applySuggestion, updateSuggestions) {
    eventService.on('event:raml-editor-initialized', function () {
      var editor = codeMirror.getEditor();
      editor.on('cursorActivity', $scope.cursorMoved.bind($scope));
    });

    $scope.cursorMoved = function () {
      $scope.model = updateSuggestions(codeMirror.getEditor());

      safeApply($scope);
    };

    $scope.orderSections = function (section) {
      var index = [
        'root',
        'docs',
        'methods',
        'parameters',
        'responses',
        'security',
        'resources',
        'traits and types'
      ].indexOf(section.name.toLowerCase());

      return (index === -1) ? index.length : index;
    };

    $scope.itemClick = function (suggestion) {
      applySuggestion(codeMirror.getEditor(), suggestion);
    };
  });
