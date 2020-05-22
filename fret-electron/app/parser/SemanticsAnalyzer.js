// *****************************************************************************
// Notices:
// 
// Copyright � 2019 United States Government as represented by the Administrator
// of the National Aeronautics and Space Administration.  All Rights Reserved.
// 
// Disclaimers
// 
// No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY WARRANTY OF
// ANY KIND, EITHER EXPRESSED, IMPLIED, OR STATUTORY, INCLUDING, BUT NOT LIMITED
// TO, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL CONFORM TO SPECIFICATIONS, 
// ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, 
// OR FREEDOM FROM INFRINGEMENT, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE
// ERROR FREE, OR ANY WARRANTY THAT DOCUMENTATION, IF PROVIDED, WILL CONFORM TO
// THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, IN ANY MANNER, CONSTITUTE AN
// ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT OF ANY RESULTS,
// RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY OTHER APPLICATIONS
// RESULTING FROM USE OF THE SUBJECT SOFTWARE.  FURTHER, GOVERNMENT AGENCY
// DISCLAIMS ALL WARRANTIES AND LIABILITIES REGARDING THIRD-PARTY SOFTWARE, IF
// PRESENT IN THE ORIGINAL SOFTWARE, AND DISTRIBUTES IT ''AS IS.''
// 
// Waiver and Indemnity:  RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS AGAINST
// THE UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS
// ANY PRIOR RECIPIENT.  IF RECIPIENT'S USE OF THE SUBJECT SOFTWARE RESULTS IN
// ANY LIABILITIES, DEMANDS, DAMAGES, EXPENSES OR LOSSES ARISING FROM SUCH USE,
// INCLUDING ANY DAMAGES FROM PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S
// USE OF THE SUBJECT SOFTWARE, RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE
// UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY
// PRIOR RECIPIENT, TO THE EXTENT PERMITTED BY LAW.  RECIPIENT'S SOLE REMEDY FOR
// ANY SUCH MATTER SHALL BE THE IMMEDIATE, UNILATERAL TERMINATION OF THIS
// AGREEMENT.
// *****************************************************************************
const constants = require('./Constants');
const RequirementListener = require('./RequirementListener').RequirementListener;
const AntlrUtilities = require('../parser/AntlrUtilities').AntlrUtilities;
const antlrUtilities = new AntlrUtilities();
const utilities = require('../../support/utilities');
const fetchSemantics = require('./FetchSemantics');
const cocospecSemantics = require('../../support/cocospecSemantics');

var result = {};

function SemanticsAnalyzer() {
  RequirementListener.call(this);
  return this;
}

function initialize(type) {
  result = {
      type: type,
      scope : { type : 'null' },
      condition: 'null',
      timing: 'null',
      response: 'action',
      variables: {
        regular: [],
        modes: []
      }
  }
}

// inherit default listener
SemanticsAnalyzer.prototype = Object.create(RequirementListener.prototype);
SemanticsAnalyzer.prototype.constructor = SemanticsAnalyzer;

// override default listener behavior
RequirementListener.prototype.enterNasa = function(ctx) {
  initialize('nasa');
}

RequirementListener.prototype.enterFreeform = function(ctx) {
  initialize('freeForm');
};

SemanticsAnalyzer.prototype.enterScope = function(ctx) {
  var text = antlrUtilities.getText(ctx).toLowerCase();
  var excl = text.includes('strictly');

  if (text.startsWith('when in ') || text.startsWith('in ') || text.startsWith('during ' )
      || (text.startsWith('unless not in')))
      result.scope.type = 'in'
  else if (text.startsWith('globally'))  // added to handle this case
      result.scope.type = 'globally'
  else if (text.includes('after'))
         { if (text.includes('only'))
            result.scope = {type : 'onlyAfter', exclusive : excl, required : false};
           else result.scope = {type : 'after', exclusive : excl, required : false}; }
  else if (text.includes('before'))
         { if (text.includes('only'))
            result.scope = {type : 'onlyBefore', exclusive : excl, required : false};
           else result.scope = {type : 'before', exclusive : excl, required : false}; }
  else if (text.startsWith('only when in') || text.startsWith('only in') ||
           text.startsWith('only during'))
      result.scope.type = 'onlyIn';
    else if (text.includes(' in ') && (text.includes('not ') != text.includes('unless ')) && !text.includes('only'))
      result.scope.type = 'notin';
  else {
      if (constants.verboseSemanticsAnalyzer) console.log("*** Scope value '" + text + "' accepted by grammar but unhandled by semanticsAnalyzer enterScope *** " );
      result.scope.type = 'unhandled';
    }
}

RequirementListener.prototype.enterScope_required = function(ctx) {
    var text = ctx.getText().toLowerCase();
    result.scope.required = !text.includes('not');
}

SemanticsAnalyzer.prototype.exitScope = function(ctx) {
  result.scopeTextRange = [ctx.start.start, ctx.stop.stop]
}

RequirementListener.prototype.enterComponent_name = function(ctx) {
    if (!result.component_name) result.component_name = ctx.getText();
}

RequirementListener.prototype.exitComponent = function(ctx) {
  // Components can appear in the response as associated components.
  // The field "componentTextRange" captures the primary
  // component for this requirement.
  if (!result.componentTextRange)
    result.componentTextRange = [ctx.start.start, ctx.stop.stop]
}

RequirementListener.prototype.enterScope_mode = function(ctx) {
    result.scope_mode = antlrUtilities.getText(ctx);
    if (result.scope_mode && !result.variables.modes.includes(result.scope_mode))
      result.variables.modes.push(result.scope_mode);
}

RequirementListener.prototype.exitReqt_condition = function(ctx) {
  result.conditionTextRange = [ctx.start.start, ctx.stop.stop]
}

RequirementListener.prototype.enterOnly_condition = function(ctx) {
  result.condition = 'only'
}

RequirementListener.prototype.enterRegular_condition = function(ctx) {
  if (result.condition == 'null') result.condition = 'regular'
  result.regular_condition = antlrUtilities.getText(ctx).replace(',', '').trim()
}

RequirementListener.prototype.enterQualifier_word = function(ctx) {
    result.qualifier_word = antlrUtilities.getText(ctx).toLowerCase().trim();
}

//RequirementListener.prototype.enterQualifier_word2 = function(ctx) {
//    result.qualifier_word2 = antlrUtilities.getText(ctx).toLowerCase().trim();
//}

RequirementListener.prototype.enterPre_condition = function(ctx) {
    result.pre_condition = '(' + antlrUtilities.getText(ctx).trim() + ')';
}

RequirementListener.prototype.exitQualified_condition1 = function(ctx) {
    var pre_condition = result.pre_condition;
    var text = antlrUtilities.getText(ctx).trim();
    var neg_polarity = text.endsWith('is false') != result.qualifier_word.startsWith('unless');
    if (neg_polarity) result.regular_condition = '(! ' + pre_condition + ')';
    else result.regular_condition = pre_condition;
}

RequirementListener.prototype.exitQualified_condition2 = function(ctx) {
    var pre_condition = result.pre_condition;
    var text = antlrUtilities.getText(ctx).trim();
    var neg_polarity = text.endsWith('is false') != result.qualifier_word.startsWith('unless');
    if (neg_polarity) pre_condition = '(! ' + pre_condition + ')';
    if (text.startsWith('or'))
	result.regular_condition = '(' + result.regular_condition + ' | ' + pre_condition + ')';
    else result.regular_condition = '(' + result.regular_condition + ' & ' + pre_condition + ')';
}

RequirementListener.prototype.enterStop_condition = function(ctx) {
    result.stop_condition = '(' + antlrUtilities.getText(ctx).trim() + ')';
}


//RequirementListener.prototype.exitRegular_condition = function(ctx) {
//   result.regular_condition = '(' + result.regular_condition + ')';
// }

RequirementListener.prototype.enterPost_condition = function(ctx) {
    let pc = '(' + antlrUtilities.getText(ctx).trim() + ')';
    let pc2 = pc.replace(/ then /g, ' => ').replace(/(\(| )if /g,((match,p1,offset,str) => p1));
    result.post_condition = pc2;
}

RequirementListener.prototype.enterTiming = function(ctx) {
  var text = antlrUtilities.getText(ctx).replace(',', '').trim().split(' ')[0]
  result.timing = (text === 'at') ? 'next' : text;
}

RequirementListener.prototype.exitTiming = function(ctx) {
  result.timingTextRange = [ctx.start.start, ctx.stop.stop]
}

// keep only the number; i.e., throw away the units
RequirementListener.prototype.enterDuration = function(ctx) {
    result.duration = antlrUtilities.getText(ctx).trim().match(/\d+(?:\.\d+)?/);
}

RequirementListener.prototype.exitResponse = function(ctx) {
  result.responseTextRange = [ctx.start.start, ctx.stop.stop]
}

RequirementListener.prototype.enterSatisfaction = function(ctx) {
    if (result.response != 'order' && result.response != 'not_order')
	result.response = 'satisfaction'
};

RequirementListener.prototype.enterOrder = function(ctx) {
    if (result.response != 'not_order') result.response = 'order'
}

RequirementListener.prototype.enterNot_order = function(ctx) {
  result.response = 'not_order'
}

RequirementListener.prototype.enterAction = function(ctx) {
  result.action = antlrUtilities.getText(ctx)
  if(ctx.ID(0)){
    var variable = ctx.ID(0).toString();
    if (variable && ! result.variables.regular.includes(variable))
      result.variables.regular.push(variable);
  }
}

RequirementListener.prototype.enterAction1 = function(ctx) {
    result.action1 = '(' + antlrUtilities.getText(ctx) + ')';

}

RequirementListener.prototype.enterAction2 = function(ctx) {
  result.action2 = '(' + antlrUtilities.getText(ctx) + ')'
}

RequirementListener.prototype.enterNumeric_expr = function(ctx) {
  if(ctx.ID(0)){
    var variable = ctx.ID(0).toString();
    if (variable && ! result.variables.regular.includes(variable))
      result.variables.regular.push(variable);
  }
};

RequirementListener.prototype.enterNew_mode = function(ctx) {
  var mode = antlrUtilities.getText(ctx);
  if (mode && !result.variables.modes.includes(mode))
    result.variables.modes.push(mode);
};


RequirementListener.prototype.enterBool_expr = function(ctx) {
  if(ctx.ID(0)){
    var variable = ctx.ID(0).toString();
    if (variable && ! result.variables.regular.includes(variable))
      result.variables.regular.push(variable);
  }
};


function replaceTemplateVarsWithArgs(formula, noHTML, noClassicImplSymbol) {
  if (formula) {
    var args = formula.match(/\$\w+\d*\$/g)
    if (args) {
      if (noHTML){
       // Update formula with arguments
        args.forEach((a) => {
            formula = formula.replace(a, result[a.substring(1, a.length - 1)])
        })
      } else {
        args.forEach((a) => {
            formula = formula.replace(a, '<b><i>' + result[a.substring(1, a.length - 1)] + '</i></b>');
        })
      }
    }
    if (noClassicImplSymbol){
      formula = formula.replace(/=>/g,'->');
    }
      return formula;
  } else // formula is instead an error message that contains no args.
    return ("Unexpected case - SemanticsAnalyzer replaceTemplateVarsWithArgs");
}

function createVariableDescription(scope, condition, timing, response, stop_condition) {
  var description = '';
  if (scope.type !== 'null' && scope.type !== 'unhandled'){
    description += 'M = $scope_mode$, ';
  }
  if (condition !=='null'){
    description += 'TC = $regular_condition$, '
  }

  if (timing=== 'after' || timing == 'within' || timing == 'for'){
    description += ' n = $duration$, ';
  }
  if (timing === 'until' || timing === 'before'){
      description += 'SC = $stop_condition$, ';
  }
  if (response === 'satisfaction')
    description += 'Response = $post_condition$.'
  else if (response === 'action')
    description += 'Response = $action$.'
  return description;

}

//----------------------------------------------------------------------
//----------------------------------------------------------------------
function replaceWithCoCoSpecSubsts(formula) {
  return utilities.replaceStrings(cocospecSemantics.CoCoSpecSubsts, formula);
}

//----------------------------------------------------------------------
//----------------------------------------------------------------------
function replaceWithVisualizationSubsts(formula) {
  
  console.log("VIS-REPL: formula="+formula);
  var RS = utilities.replaceStrings(cocospecSemantics.CoCoSpecSubsts, formula);
  console.log("VIS-REPL: formula after repl="+RS);

  var RRS = cocospecSemantics.createCoCoSpecCode(formula);
  
  console.log("VIS-REPL: formula after cocospec-create="+RRS);

  return RS;
//  return utilities.replaceStrings(VisualizationSemantics.VisualizationSubsts, formula);
}

//----------------------------------------------------------------------
//----------------------------------------------------------------------
function replaceWithR2U2Substs(formula) {
  return utilities.replaceStrings(R2U2Semantics.R2U2Substs, formula);
}

//----------------------------------------------------------------------
//----------------------------------------------------------------------
SemanticsAnalyzer.prototype.semantics = () => {
  if (result.type === 'nasa'){
      console.log('result: ' + JSON.stringify(result))
      var variableDescription = createVariableDescription(result.scope, result.condition, result.timing, result.response, result.stop_condition);
    var fetchedSemantics = fetchSemantics.getSemantics(result.scope, result.condition, result.timing, result.response);
    result.ft = replaceTemplateVarsWithArgs(fetchedSemantics.ft, false, true);
    result.pt = replaceTemplateVarsWithArgs(fetchedSemantics.pt, false, true);
    result.ftExpanded = replaceTemplateVarsWithArgs(fetchedSemantics.ftExpanded, false, true);
    result.ptExpanded = replaceTemplateVarsWithArgs(fetchedSemantics.ptExpanded, false, true);
    result.component = replaceTemplateVarsWithArgs('$component_name$', false, false);
    result.CoCoSpecCode = replaceWithCoCoSpecSubsts(replaceTemplateVarsWithArgs(fetchedSemantics.CoCoSpecCode, true, false));
    if (variableDescription !== ''){
      result.diagramVariables = replaceTemplateVarsWithArgs(variableDescription, false, false);
    }
    result.description = replaceTemplateVarsWithArgs(fetchedSemantics.description, false, false);
    result.diagram = fetchedSemantics.diagram;
  } else if (result.type === 'freeForm'){
    result.ft = constants.natural_semantics;
    result.description = constants.natural_description;
  }
  return result;
}

//----------------------------------------------------------------------
//----------------------------------------------------------------------
SemanticsAnalyzer.prototype.clearResult = () => {
  result = {};
}

SemanticsAnalyzer.prototype.semanticsNoFormalization = () => {
  return result;
}


exports.SemanticsAnalyzer = SemanticsAnalyzer;
