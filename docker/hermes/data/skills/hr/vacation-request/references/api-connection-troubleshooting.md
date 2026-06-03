# API Connection Troubleshooting - Vacation Request

## Real-World Error Examples

### Connection Failed Examples

**Example 1: Localhost Connection Failed**
```
curl: (7) Failed to connect to localhost port 5000 after 0 ms: Could not connect to server
```
- **Cause**: Trying to connect to localhost instead of the correct API server IP
- **Solution**: Always use `http://172.20.10.2:5000` as the base URL

**Example 2: Not Found Response**
```
{"error":"Not Found"}
```
- **Status**: HTTP 200 with JSON error response
- **Cause**: Endpoints may be different from documented or server configuration issues
- **Solution**: 
  1. Verify endpoint paths
  2. Check server logs
  3. Use the Node.js client for proper path handling

### Diagnostic Commands

When API connection fails, run these diagnostic commands:

**Check if any process is listening on port 5000:**
```bash
# Linux systems with netstat
netstat -tlnp | grep :5000

# Linux systems with ss (newer)
ss -tlnp | grep :5000

# Linux systems with lsof
lsof -i :5000
```

**Note**: These commands may not be available in all environments (missing in containerized setups).

### Fallback Procedure

When API is completely unavailable:

1. **Calculate vacation duration manually:**
   ```javascript
   // JavaScript example
   const start = new Date('2026-11-02');
   const end = new Date('2026-11-20');
   const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
   // Result: 19 days
   ```

2. **Prepare text-based application:**
   ```
   📋 ЗАЯВКА НА ОТПУСК
   
   Сотрудник: [Employee Name]
   Должность: [Position]
   Тип отпуска: [Type]
   Период: [start date] — [end date]
   Количество дней: [calculated days]
   Примечание: [comment]
   
   Дата создания: [current date]
   ```

3. **Communication to user:**
   ```
   ❌ API сервер Worker Cabinet недоступен. 
   Заявка подготовлена в текстовом формате. 
   Пожалуйста, подайте её через отдел кадров или проверьте доступность API сервера.
   ```

### Node.js Client Example

When available, use the Worker Cabinet Node.js client for more reliable API interaction:

```javascript
const WorkerCabinetClient = require('./index');
const client = new WorkerCabinetClient('http://172.20.10.2:5000', 'token');

// The client handles proper endpoint paths and error handling
const request = await client.createVacationRequest({
  startDate: '2026-11-02',
  endDate: '2026-11-20', 
  vacationType: 'annual_paid',
  comment: 'Отпуск за 2026 год'
});
```

### Common Issues and Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Wrong URL | Connection refused | Use `http://172.20.10.2:5000` not localhost |
| Server down | Connection timeout | Contact system administrator |
| Wrong endpoints | 404 Not Found | Verify API documentation or use Node.js client |
| Network issues | Connection failed | Check firewall and network configuration |