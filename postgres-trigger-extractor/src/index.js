require('dotenv').config();
const { Client } = require('pg');
const { extractTriggers } = require('./extractors/triggerExtractor');
const fs = require('fs');

const connectionString = process.env.DATABASE_URL;

const client = new Client({
    connectionString: connectionString,
});

async function main() {
    try {
        await client.connect();
        console.log('Connected to the database');

        const triggers = await extractTriggers(client);
        console.log(triggers);
        // Filter only BEFORE INSERT triggers
        const beforeTriggers = triggers.filter(trigger =>
            trigger.trigger_definition.toUpperCase().includes('BEFORE INSERT') ||
            trigger.trigger_definition.toUpperCase().includes('BEFORE UPDATE')
        );
        

        console.log('\n==== BEFORE INSERT Trigger Functions ====\n');

        beforeTriggers.forEach(trigger => {
            // Format the string to write to the file
            const triggerFunctionData = `
                Function Name:${trigger.function_name}
                Function Definition:${trigger.function_definition}
                ${'='.repeat(50)}`;
            fs.appendFileSync('output1.txt', triggerFunctionData);
        });

    } catch (error) {
        console.error('Error connecting to the database or extracting triggers:', error);
    } finally {
        await client.end();
        console.log('Database connection closed');
    }
}

main();
