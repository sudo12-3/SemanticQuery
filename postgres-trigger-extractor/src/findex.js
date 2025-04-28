require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs').promises;
const connectionString = process.env.DATABASE_URL;
async function generateRLSPolicies(jsonPath) {
    // Load and parse JSON data
    const data = await fs.readFile(jsonPath, 'utf8');
    const { insert, update } = JSON.parse(data);

    // Create composite keys for comparison
    const insertRules = new Set(
        insert.map(rule => `${rule.table}|${rule.attribute}|${rule.rule}`)
    );
    
    // Find rules that exist in both insert and update with same values
    const validRules = update.filter(updateRule => 
        insertRules.has(`${updateRule.table}|${updateRule.attribute}|${updateRule.rule}`)
    );

    if (validRules.length === 0) {
        console.log("No matching rules found in both insert and update arrays");
        return;
    }

    // Generate and execute SQL commands
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log('Connected to database');
        for (const rule of validRules) {
            const createPolicySQL = `
                 -- Enable RLS if not already enabled
                ALTER TABLE ${rule.table} ENABLE ROW LEVEL SECURITY;
                
                -- Optional: Force restrictive mode (AND combination)
                -- ALTER TABLE ${rule.table} FORCE ROW LEVEL SECURITY;
                
                -- Drop existing policy if exists
                DROP POLICY IF EXISTS ${rule.table}_select_policy_${rule.attribute} ON ${rule.table};
                
                -- Create new policy
                CREATE POLICY ${rule.table}_select_policy_${rule.attribute}
                ON ${rule.table}
                FOR SELECT
                TO PUBLIC
                USING (${rule.rule});
                
            `;

            console.log(`Creating policies for table ${rule.table}:`);
            await client.query(createPolicySQL);
        }
        
        console.log("Successfully created all RLS policies");
        
    } catch (error) {
        console.error("Error creating policies:", error);
    } finally {
        await client.end();
    }
}

// Usage example
generateRLSPolicies('categorized_rules.json').catch(console.error);