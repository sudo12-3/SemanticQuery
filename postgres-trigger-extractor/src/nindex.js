require('dotenv').config();
const { Client } = require('pg');
const { extractTriggers } = require('./extractors/triggerExtractor');
const fs = require('fs').promises;

const connectionString = process.env.DATABASE_URL;
const OPERATOR_MAP = { '<=': '>', '>=': '<', '<': '>=', '>': '<=', '=': '!=', '!=': '=' };

async function getBeforeTriggers(client) {
    const triggers = await extractTriggers(client);
    
    return triggers.filter(t => {
        const def = t.trigger_definition.toUpperCase();
        return def.includes('BEFORE INSERT') || def.includes('BEFORE UPDATE');
    });
}

// Helper to clean up the captured value
function cleanValue(value) {
    if (!value) return '';
    
    // Remove trailing artifacts
    value = value.trim().replace(/[,;)]$/, '');
    
    // Keep quotes if present
    if ((value.startsWith("'") && value.endsWith("'")) || 
        (value.startsWith('"') && value.endsWith('"'))) {
        return value;
    }
    return value;
}

// Main function to analyze trigger function logic
function analyzeTriggerFunction(functionDef) {
    let rules = [];
    
    // Pattern 1: IF condition THEN RETURN NULL; RETURN NEW; END IF;
    // This pattern indicates condition must be false for operation to proceed
    const returnNullPattern = /IF\s+(?:NEW\.)?(\w+)\s+([<>=!]{1,2})\s+([^;\s()]+)\s+THEN\s+RETURN\s+NULL;\s*RETURN\s+NEW;/is;
    const nullMatch = functionDef.match(returnNullPattern);
    
    if (nullMatch) {
        const [_, column, operator, value] = nullMatch;
        // Invert the operator for the actual rule
        rules.push({
            attribute: column,
            operator: OPERATOR_MAP[operator] || operator,
            value: cleanValue(value)
        });
    }
    
    // Pattern 2: IF condition THEN RETURN NEW; ELSE ... RETURN NULL; END IF;
    // This pattern indicates condition must be true for operation to proceed
    const returnNewPattern = /IF\s+(?:NEW\.)?(\w+)\s+([<>=!]{1,2})\s+([^;\s()]+)\s+THEN\s+RETURN\s+NEW;\s*ELSE/is;
    const newMatch = functionDef.match(returnNewPattern);
    
    if (newMatch) {
        const [_, column, operator, value] = newMatch;
        // Use the operator as is
        rules.push({
            attribute: column,
            operator: operator,
            value: cleanValue(value)
        });
    }
    
    // If neither pattern matched, try a more generic approach
    if (rules.length === 0) {
        // Check if function has both RETURN NULL and RETURN NEW
        const hasReturnNull = /RETURN\s+NULL/i.test(functionDef);
        const hasReturnNew = /RETURN\s+NEW/i.test(functionDef);
        
        if (hasReturnNull && hasReturnNew) {
            // Extract the first condition we find
            const conditionMatch = functionDef.match(/IF\s+(?:NEW\.)?(\w+)\s+([<>=!]{1,2})\s+([^;\s()]+)/is);
            
            if (conditionMatch) {
                const [_, column, operator, value] = conditionMatch;
                
                // Determine if this is a NULL-first or NEW-first pattern
                const nullIndex = functionDef.indexOf('RETURN NULL');
                const newIndex = functionDef.indexOf('RETURN NEW');
                
                if (nullIndex < newIndex) {
                    // IF condition THEN RETURN NULL pattern (invert operator)
                    rules.push({
                        attribute: column,
                        operator: OPERATOR_MAP[operator] || operator,
                        value: cleanValue(value)
                    });
                } else {
                    // IF condition THEN RETURN NEW pattern (keep operator)
                    rules.push({
                        attribute: column,
                        operator: operator,
                        value: cleanValue(value)
                    });
                }
            }
        }
    }
    
    return rules;
}

function processTriggers(triggers, type) {
    const filteredTriggers = triggers.filter(t => 
        t.trigger_definition.toUpperCase().includes(type)
    );
    
    let rules = [];
    
    filteredTriggers.forEach(trigger => {
        const analyzedRules = analyzeTriggerFunction(trigger.function_definition);
        
        analyzedRules.forEach(rule => {
            rules.push({
                table: trigger.table_name,
                attribute: rule.attribute,
                rule: `${rule.attribute} ${rule.operator} ${rule.value}`
            });
        });
    });
    
    // Group rules by table and attribute to resolve conflicts
    const ruleMap = {};
    
    rules.forEach(rule => {
        const key = `${rule.table}-${rule.attribute}`;
        if (!ruleMap[key]) {
            ruleMap[key] = new Set();
        }
        ruleMap[key].add(rule.rule);
    });
    
    // Convert back to array format
    const uniqueRules = [];
    Object.entries(ruleMap).forEach(([key, ruleSet]) => {
        const [table, attribute] = key.split('-');
        
        ruleSet.forEach(rule => {
            uniqueRules.push({
                table,
                attribute,
                rule
            });
        });
    });
    
    return uniqueRules;
}

async function main() {
    const client = new Client({ connectionString });
    console.log('Connection string:', process.env.DATABASE_URL);
    
    try {
        await client.connect();
        console.log('Connected to database');

        const triggers = await getBeforeTriggers(client);
        console.log('Extracted triggers:', triggers.length);
        
        // Extract and process rules
        const insertRules = processTriggers(triggers, 'INSERT');
        const updateRules = processTriggers(triggers, 'UPDATE');
        
        const results = {
            insert: insertRules,
            update: updateRules
        };

        const output = {
            generated_at: new Date().toISOString(),
            ...results
        };

        await fs.writeFile('categorized_rules.json', JSON.stringify(output, null, 2));
        console.log('Successfully generated categorized rules');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

main();