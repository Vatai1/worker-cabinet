#!/usr/bin/env node

import jwt from 'jsonwebtoken'

const payload = { id: '10', email: 'docs-test@example.com', role: 'employee' }
const token = jwt.sign(payload, 'your-secret-key-change-in-production')
console.log(token)
