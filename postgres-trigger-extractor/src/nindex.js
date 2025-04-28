require('dotenv').config();
const { Client } = require('pg');
const { extractTriggers } = require('./extractors/triggerExtractor');
const fs = require('fs').promises;

const connectionString = process.env.DATABASE_URL;
const OPERATOR_MAP = { '<=': '>', '>=': '<', '<': '>=', '>': '<=', '=': '!=', '!=': '=' };

// Pattern definitions
const PATTERNS = {
    INSERT_RETURN_NULL: /IF\s+NEW\.(\w+)\s*([<>=!]+)\s*(\d+)\s*THEN\s*.*?RETURN\s+NULL;\s*END\s+IF;/is,
    UPDATE_RETURN_NULL: /IF\s+NEW\.(\w+)\s*([<>=!]+)\s*(\d+)\s*THEN\s*.*?RETURN\s+NULL;\s*END\s+IF;/is,
    INSERT_ACTION: /IF\s+NEW\.(\w+)\s*([<>=!]+)\s*(\d+)\s*THEN\s*.*?RETURN\s+NEW;\s*END\s+IF;/is,
    UPDATE_ACTION: /IF\s+NEW\.(\w+)\s*([<>=!]+)\s*(\d+)\s*THEN\s*.*?RETURN\s+NEW;\s*END\s+IF;/is,
};

async function getBeforeTriggers(client) {
    const triggers = await extractTriggers(client);
    
    return triggers.filter(t => {
        const def = t.trigger_definition.toUpperCase();
        return def.includes('BEFORE INSERT') || def.includes('BEFORE UPDATE');
    });
}

// Processing functions
function processInsertReturnNull(triggers) {
    return triggers.filter(t => t.trigger_definition.includes('INSERT'))
        .map(t => {
            const match = t.function_definition.match(PATTERNS.INSERT_RETURN_NULL);
            if (!match) return null;
            
            const [_, col, op, val] = match;
            return {
                table: t.table_name,
                attribute: col,
                rule: `${col} ${OPERATOR_MAP[op]} ${val}`,
            };
        }).filter(Boolean);
}

function processUpdateReturnNull(triggers) {
    return triggers.filter(t => t.trigger_definition.includes('UPDATE'))
        .map(t => {
            const match = t.function_definition.match(PATTERNS.UPDATE_RETURN_NULL);
            if (!match) return null;

            const [_, col, op, val] = match;
            return {
                table: t.table_name,
                attribute: col,
                rule: `${col} ${OPERATOR_MAP[op]} ${val}`,
            };
        }).filter(Boolean);
}

function processInsertAction(triggers) {
    return triggers.filter(t => t.trigger_definition.includes('INSERT'))
        .map(t => {
            const match = t.function_definition.match(PATTERNS.INSERT_ACTION);
            if (!match) return null;

            const [_, col, op, val] = match;
            return {
                table: t.table_name,
                attribute: col,
                rule: `${col} ${op} ${val}`,
            };
        }).filter(Boolean);
}

function processUpdateAction(triggers) {
    return triggers.filter(t => t.trigger_definition.includes('UPDATE'))
        .map(t => {
            const match = t.function_definition.match(PATTERNS.UPDATE_ACTION);
            if (!match) return null;

            const [_, col, op, val] = match;
            return {
                table: t.table_name,
                attribute: col,
                rule: `${col} ${op} ${val}`,
            };
        }).filter(Boolean);
}

async function main() {
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log('Connected to database');

        const triggers = await getBeforeTriggers(client);
        const results = {
            insert: processInsertReturnNull(triggers).concat(processInsertAction(triggers)),
            update: processUpdateReturnNull(triggers).concat(processUpdateAction(triggers)),
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