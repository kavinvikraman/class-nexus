/**
 * ClassNexus RAG API test script
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001';

async function runTest() {
  console.log('🏁 Starting RAG Integration Test...');

  try {
    // 1. Create a new chat session
    console.log('\nStep 1: Creating a new chat session...');
    const sessionRes = await fetch(`${API_BASE}/api/rag/history/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'RAG Verification Chat' })
    });
    const sessionData = await sessionRes.json();
    if (!sessionRes.ok) throw new Error(sessionData.error || 'Failed to create session');
    const sessionId = sessionData.session._id;
    console.log(`✅ Session created successfully: ID = ${sessionId}`);

    // 2. Upload and Ingest Document
    console.log('\nStep 2: Uploading and ingesting test-large.pdf...');
    const pdfPath = path.join(__dirname, '../../test-large.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Test PDF not found at ${pdfPath}. Please generate it first.`);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    const uploadRes = await fetch(`${API_BASE}/api/rag/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-large.pdf',
        category: 'notes',
        fileSize: pdfBuffer.length,
        file: pdfBase64
      })
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
    console.log('✅ Document ingested successfully.');
    console.log(`   Document Name: ${uploadData.document.name}`);
    console.log(`   Chunks Created: ${uploadData.chunksCount}`);

    // 3. Query the Assistant (Retrieval-Augmented)
    console.log('\nStep 3: Querying the assistant with RAG...');
    const queryRes = await fetch(`${API_BASE}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        question: 'What is page one of the sample study notes about?',
        category: 'notes'
      })
    });
    const queryData = await queryRes.json();
    if (!queryRes.ok) throw new Error(queryData.error || 'Query failed');
    console.log('✅ RAG Response received:');
    console.log(`   Answer: ${queryData.content}`);
    console.log(`   Sources Used: ${JSON.stringify(queryData.sources)}`);

    // 4. Retrieve chat history to verify persistence
    console.log('\nStep 4: Retrieving chat history to verify persistence...');
    const historyRes = await fetch(`${API_BASE}/api/rag/history/${sessionId}`);
    const historyData = await historyRes.json();
    if (!historyRes.ok) throw new Error(historyData.error || 'History fetch failed');
    console.log(`✅ Chat history verified. Session has ${historyData.session.messages.length} messages.`);
    
    console.log('\n🎉 RAG API INTEGRATION TEST COMPLETED SUCCESSFULLY! ALL PASS!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTest();
