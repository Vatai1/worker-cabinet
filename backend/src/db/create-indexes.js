import { query } from '../config/database.js'

async function createIndexes() {
  console.log('Creating database indexes for performance optimization...\n')

  const indexes = [
    {
      name: 'idx_users_manager_id',
      table: 'users',
      columns: 'manager_id',
      description: 'Speed up subordinates queries',
    },
    {
      name: 'idx_users_department_id',
      table: 'users',
      columns: 'department_id',
      description: 'Speed up department member queries',
    },
    {
      name: 'idx_users_email',
      table: 'users',
      columns: 'email',
      description: 'Speed up email lookups',
    },
    {
      name: 'idx_project_members_project_user',
      table: 'company_project_members',
      columns: 'project_id, user_id',
      description: 'Speed up project membership checks',
    },
    {
      name: 'idx_vacation_requests_user_status',
      table: 'vacation_requests',
      columns: 'user_id, status_id',
      description: 'Speed up vacation request queries',
    },
    {
      name: 'idx_vacation_requests_dates',
      table: 'vacation_requests',
      columns: 'start_date, end_date',
      description: 'Speed up date range queries',
    },
    {
      name: 'idx_project_documents_project',
      table: 'project_documents',
      columns: 'project_id',
      description: 'Speed up document queries',
    },
    {
      name: 'idx_project_folders_project',
      table: 'project_folders',
      columns: 'project_id',
      description: 'Speed up folder queries',
    },
  ]

  try {
    let created = 0
    let skipped = 0
    let failed = 0

    for (const index of indexes) {
      try {
        const checkResult = await query(
          `SELECT indexname FROM pg_indexes WHERE indexname = $1`,
          [index.name]
        )

        if (checkResult.rows.length > 0) {
          console.log(`  ⏭  Index ${index.name} already exists, skipping...`)
          skipped++
          continue
        }

        console.log(`  Creating index: ${index.name}...`)
        await query(
          `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table} (${index.columns})`
        )
        console.log(`  ✅ Created index: ${index.name}`)
        created++
      } catch (error) {
        console.log(`  ❌ Failed to create index ${index.name}: ${error.message}`)
        failed++
      }
    }

    console.log(`\n📊 Index creation complete:`)
    console.log(`   Created: ${created}`)
    console.log(`   Skipped (already exists): ${skipped}`)
    console.log(`   Failed: ${failed}`)
    console.log(`   Total: ${indexes.length}`)
  } catch (error) {
    console.error('Error creating indexes:', error)
    console.log('\n❌ Some indexes may have failed. Check the manually.')
    console.log('\n💡 Recommended: Run this migration after deployment to ensure indexes are created')
    process.exit(0)
  }
}

createIndexes()
  .then(() => {
    console.log('\n✅ Database indexes setup complete')
    console.log('\n💡 Next steps:')
    console.log('1. Monitor query performance after deployment')
    console.log('2. Consider adding composite indexes for frequently joined columns')
    console.log('3. Run this script periodically during maintenance')
  })
  .catch((error) => {
    console.error('Failed to create indexes:', error)
    process.exit(1)
  })
