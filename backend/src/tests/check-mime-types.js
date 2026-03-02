#!/usr/bin/env node

import { query } from '../config/database.js'

async function checkDocumentMimeTypes() {
  console.log('🔍 Checking document MIME types in database...\n')
  
  const result = await query(`
    SELECT 
      d.id,
      d.name,
      d.mime_type,
      d.file_path,
      p.name as project_name
    FROM project_documents d
    JOIN company_projects p ON d.project_id = p.id
    ORDER BY d.id DESC
    LIMIT 10
  `)
  
  console.log('📄 Documents:')
  result.rows.forEach((doc, index) => {
    console.log(`\n${index + 1}. ${doc.name}`)
    console.log(`   ID: ${doc.id}`)
    console.log(`   MIME type: ${doc.mime_type}`)
    console.log(`   File path: ${doc.file_path}`)
    console.log(`   Project: ${doc.project_name}`)
    
    // Check if MIME type is correct for OnlyOffice
    const isDocx = doc.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const isMsWord = doc.mime_type === 'application/msword'
    const endsWithDocx = doc.name.toLowerCase().endsWith('.docx')
    
    console.log(`   ✅ DOCX MIME: ${isDocx}`)
    console.log(`   ✅ MS Word MIME: ${isMsWord}`)
    console.log(`   ✅ Ends with .docx: ${endsWithDocx}`)
  })
}

checkDocumentMimeTypes()
