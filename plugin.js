'use strict';
const generate = require('@babel/generator').default;
const { visitors } = require('@babel/traverse');
const traverse = require('@babel/traverse').default;
const parse = require('@babel/parser').parse;
const template = require('@babel/template').default;
const t = require('@babel/types');

const code = `
function Comp() {
    const onPress = React.useCallback(() => {
        console.log('sdf');
    }, []);

    const onPress2 = React.useCallback(function cb() {
        console.log('sdf');
    }, []);

    return (
        React.createElement('button', {
            onPress,
        })
    );
}
`;

const ast = parse(code);

traverse(ast, {
    enter(path) {
        if (path.node.type === 'Identifier' && path.node.name === 'useCallback') {
            // the variable to which useCallback is resolved
            const variable = path.getStatementParent();
            const variableName = variable.node.declarations[0].id.name; // TODO: is it safe to get it this way?

            let stopTraverse = false;
            let fn = null;
            let deps = null;
            traverse(variable.node, {
                enter(path) {
                    if (stopTraverse) {
                        return;
                    }
                    if (path.node.type === 'CallExpression') {
                        fn = path.node.arguments[0];
                        deps = path.node.arguments[1];

                        stopTraverse = true;
                    }
                }
            }, variable.scope, variable)

            if (fn == null || deps == null) {
                // can't apply proper transform
                return;
            }

            if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') {
                // nothing to optimise
                // + if prevents from second pass 
                // (when we replace variable below, 
                //  it tries to traverse through this code too and can stuck at useCallback call,
                //  hence can go to an infinite loop)
                return;
            }

            const buildUseCallbackOptimised = template(`
const ${variableName}GeneratedRef = React.useRef(null);

if (${variableName}GeneratedRef.current == null) {
    ${variableName}GeneratedRef.current = CB;
}

const ${variableName} = React.useCallback(${variableName}GeneratedRef.current, DEPS);

`);

            const useCallbackOptimisedAst = buildUseCallbackOptimised({
                CB: fn,
                DEPS: deps
            });

            variable.replaceWithMultiple(useCallbackOptimisedAst);
        }
    }
  });

console.log(generate(ast).code);