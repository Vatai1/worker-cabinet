import { useState, useEffect, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
  isToday,
  parseISO,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import { useAnalyticsStore } from '@/store/analyticsStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { TrendPeriod, UpcomingAbsence } from '@/types'
import {
  TrendingUp,
  Calendar,
  Users,
  BarChart3,
  RefreshCw,
  LineChart as LineChartIcon,
  Building2,
  CalendarDays,
  User,
  FileText,
  FileSpreadsheet,
} from 'lucide-react'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-red-500',
]

function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function HRAnalytics() {
  const {
    trends,
    trendsLoading,
    trendsError,
    fetchTrends,
    refreshTrends,
    utilization,
    utilizationLoading,
    utilizationError,
    fetchUtilization,
    refreshUtilization,
    upcomingAbsences,
    upcomingAbsencesLoading,
    upcomingAbsencesError,
    fetchUpcomingAbsences,
  } = useAnalyticsStore()

  const [period, setPeriod] = useState<TrendPeriod>('monthly')
  const [year] = useState(new Date().getFullYear())
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const [utilizationYear] = useState(new Date().getFullYear())
  const [upcomingDays] = useState(30)

  useEffect(() => {
    fetchTrends(period, year)
  }, [period, year, fetchTrends])

  useEffect(() => {
    fetchUtilization(utilizationYear)
  }, [utilizationYear, fetchUtilization])

  useEffect(() => {
    fetchUpcomingAbsences(upcomingDays)
  }, [upcomingDays, fetchUpcomingAbsences])

  const handleRefresh = () => {
    refreshTrends()
  }

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    // Title
    doc.setFontSize(18)
    doc.text('HR Analytics Report', pageWidth / 2, 20, { align: 'center' })
    doc.setFontSize(12)
    doc.text(`Generated: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, pageWidth / 2, 30, { align: 'center' })

    // Summary Statistics
    doc.setFontSize(14)
    doc.text('Summary Statistics', 14, 45)
    doc.setFontSize(11)
    doc.text(`Total Requests: ${totalRequests}`, 14, 55)
    doc.text(`Total Vacation Days: ${totalDays}`, 14, 62)
    doc.text(`Average Employees per Period: ${avgEmployees}`, 14, 69)

    // Trends Data Table
    if (trends?.data && trends.data.length > 0) {
      doc.setFontSize(14)
      doc.text('Vacation Trends', 14, 85)
      doc.setFontSize(10)

      let yPosition = 95
      const colWidths = [50, 40, 40, 50]
      const headers = ['Period', 'Requests', 'Days', 'Employees']

      // Table header
      doc.setFillColor(240, 240, 240)
      doc.rect(14, yPosition - 5, pageWidth - 28, 8, 'F')
      doc.setFont('helvetica', 'bold')
      headers.forEach((header, i) => {
        const xPos = 14 + colWidths.slice(0, i).reduce((a, b) => a + b, 0)
        doc.text(header, xPos, yPosition)
      })
      yPosition += 10

      // Table rows
      doc.setFont('helvetica', 'normal')
      trends.data.forEach((item) => {
        if (yPosition > 270) {
          doc.addPage()
          yPosition = 20
        }
        const rowData = [item.label, String(item.requestCount), String(item.totalDays), String(item.uniqueEmployees)]
        rowData.forEach((cell, i) => {
          const xPos = 14 + colWidths.slice(0, i).reduce((a, b) => a + b, 0)
          doc.text(cell, xPos, yPosition)
        })
        yPosition += 7
      })
    }

    // Department Utilization
    if (utilization?.data && utilization.data.length > 0) {
      let yPosition = doc.getCurrentPageInfo().pageNumber > 1 ? 20 : 140
      if (yPosition > 250) {
        doc.addPage()
        yPosition = 20
      }

      doc.setFontSize(14)
      doc.text('Department Utilization', 14, yPosition)
      yPosition += 10
      doc.setFontSize(10)

      utilization.data.forEach((item) => {
        if (yPosition > 270) {
          doc.addPage()
          yPosition = 20
        }
        doc.text(`${item.departmentName}: ${Math.round(item.utilizationPercentage)}% (${item.totalDaysUsed}/${item.totalAvailableDays} days)`, 14, yPosition)
        yPosition += 7
      })
    }

    // Upcoming Absences
    if (upcomingAbsences?.data && upcomingAbsences.data.length > 0) {
      doc.addPage()
      let yPosition = 20

      doc.setFontSize(14)
      doc.text('Upcoming Absences', 14, yPosition)
      yPosition += 10
      doc.setFontSize(10)

      upcomingAbsences.data.slice(0, 20).forEach((absence) => {
        if (yPosition > 270) {
          doc.addPage()
          yPosition = 20
        }
        const name = `${absence.employee.lastName} ${absence.employee.firstName}`
        const dates = `${format(parseISO(absence.startDate), 'dd.MM.yyyy')} - ${format(parseISO(absence.endDate), 'dd.MM.yyyy')}`
        doc.text(`${name}: ${dates} (${absence.duration} days)`, 14, yPosition)
        yPosition += 7
      })

      if (upcomingAbsences.data.length > 20) {
        doc.text(`... and ${upcomingAbsences.data.length - 20} more`, 14, yPosition)
      }
    }

    // Save the PDF
    doc.save(`hr-analytics-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
  }

  // Export to Excel
  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new()

    // Summary Sheet
    const summaryData = [
      ['HR Analytics Report'],
      [`Generated: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`],
      [],
      ['Summary Statistics'],
      ['Total Requests', totalRequests],
      ['Total Vacation Days', totalDays],
      ['Average Employees per Period', avgEmployees],
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

    // Trends Sheet
    if (trends?.data && trends.data.length > 0) {
      const trendsHeader = ['Period', 'Request Count', 'Total Days', 'Unique Employees']
      const trendsData = [
        trendsHeader,
        ...trends.data.map((item) => [
          item.label,
          item.requestCount,
          item.totalDays,
          item.uniqueEmployees,
        ]),
      ]
      const trendsSheet = XLSX.utils.aoa_to_sheet(trendsData)
      XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Vacation Trends')
    }

    // Department Utilization Sheet
    if (utilization?.data && utilization.data.length > 0) {
      const utilizationHeader = ['Department', 'Utilization %', 'Days Used', 'Days Available', 'Employee Count']
      const utilizationData = [
        utilizationHeader,
        ...utilization.data.map((item) => [
          item.departmentName,
          Math.round(item.utilizationPercentage),
          item.totalDaysUsed,
          item.totalAvailableDays,
          item.employeeCount,
        ]),
      ]
      const utilizationSheet = XLSX.utils.aoa_to_sheet(utilizationData)
      XLSX.utils.book_append_sheet(workbook, utilizationSheet, 'Department Utilization')
    }

    // Upcoming Absences Sheet
    if (upcomingAbsences?.data && upcomingAbsences.data.length > 0) {
      const absencesHeader = ['Employee', 'Position', 'Department', 'Start Date', 'End Date', 'Duration (Days)', 'Vacation Type']
      const absencesData = [
        absencesHeader,
        ...upcomingAbsences.data.map((absence) => [
          `${absence.employee.lastName} ${absence.employee.firstName}${absence.employee.middleName ? ' ' + absence.employee.middleName : ''}`,
          absence.employee.position,
          absence.employee.departmentName || '',
          format(parseISO(absence.startDate), 'dd.MM.yyyy'),
          format(parseISO(absence.endDate), 'dd.MM.yyyy'),
          absence.duration,
          absence.vacationTypeName,
        ]),
      ]
      const absencesSheet = XLSX.utils.aoa_to_sheet(absencesData)
      XLSX.utils.book_append_sheet(workbook, absencesSheet, 'Upcoming Absences')
    }

    // Save the Excel file
    XLSX.writeFile(workbook, `hr-analytics-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  // Prepare chart data from trends response
  const chartData = trends?.data?.map((item) => ({
    name: item.label,
    'Количество заявок': item.requestCount,
    'Всего дней': item.totalDays,
    'Уникальных сотрудников': item.uniqueEmployees,
  })) || []

  // Calculate summary statistics
  const totalRequests = trends?.data?.reduce((sum, item) => sum + item.requestCount, 0) || 0
  const totalDays = trends?.data?.reduce((sum, item) => sum + item.totalDays, 0) || 0
  const avgEmployees = trends?.data?.length
    ? Math.round(trends.data.reduce((sum, item) => sum + item.uniqueEmployees, 0) / trends.data.length)
    : 0

  const periodLabels: Record<TrendPeriod, string> = {
    monthly: 'По месяцам',
    quarterly: 'По кварталам',
    yearly: 'По годам',
  }

  const stats = [
    {
      title: 'Всего заявок',
      value: totalRequests.toString(),
      description: `за ${year} год`,
      icon: BarChart3,
      gradient: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Всего дней отпуска',
      value: totalDays.toString(),
      description: 'использовано',
      icon: Calendar,
      gradient: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Среднее кол-во сотрудников',
      value: avgEmployees.toString(),
      description: 'в периоде',
      icon: Users,
      gradient: 'from-emerald-500 to-emerald-600',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header section */}
      <div className="rounded-2xl gradient-primary p-8 text-white shadow-glow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              HR Аналитика
            </h1>
            <p className="mt-2 text-white/90 text-lg">
              Аналитическая панель по отпускам и отсутствиям
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToPDF}
              disabled={trendsLoading || !trends?.data?.length}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={trendsLoading || !trends?.data?.length}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={trendsLoading}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${trendsLoading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className="group cursor-pointer overflow-hidden relative hover:scale-105 transition-transform duration-300" style={{ animationDelay: `${index * 100}ms` }}>
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {stat.title}
                </CardTitle>
                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <p className="text-sm text-muted-foreground mt-2 font-medium">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Vacation Trends Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Тренды отпусков
              </CardTitle>
              <CardDescription>
                Динамика использования отпусков по периодам
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Period selector */}
              <div className="flex rounded-lg border border-border p-1">
                {(['monthly', 'quarterly', 'yearly'] as TrendPeriod[]).map((p) => (
                  <Button
                    key={p}
                    variant={period === p ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPeriod(p)}
                    className="text-xs"
                  >
                    {periodLabels[p]}
                  </Button>
                ))}
              </div>
              {/* Chart type selector */}
              <div className="flex rounded-lg border border-border p-1">
                <Button
                  variant={chartType === 'bar' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setChartType('bar')}
                  className="text-xs"
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Столбцы
                </Button>
                <Button
                  variant={chartType === 'line' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setChartType('line')}
                  className="text-xs"
                >
                  <LineChartIcon className="h-4 w-4 mr-1" />
                  Линии
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Error state */}
          {trendsError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 mb-4">
              <p className="text-sm text-destructive">{trendsError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
                Попробовать снова
              </Button>
            </div>
          )}

          {/* Loading state */}
          {trendsLoading && (
            <div className="flex items-center justify-center h-80">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Загрузка данных...</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!trendsLoading && !trendsError && chartData.length === 0 && (
            <div className="flex items-center justify-center h-80">
              <div className="flex flex-col items-center gap-4 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
                <div>
                  <p className="text-lg font-medium">Нет данных</p>
                  <p className="text-sm text-muted-foreground">
                    Данные о трендах отпусков отсутствуют за выбранный период
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          {!trendsLoading && !trendsError && chartData.length > 0 && (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend />
                    <Bar
                      dataKey="Количество заявок"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Всего дней"
                      fill="hsl(220 70% 50%)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Уникальных сотрудников"
                      fill="hsl(160 70% 45%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <YAxis
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Количество заявок"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Всего дней"
                      stroke="hsl(220 70% 50%)"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(220 70% 50%)', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Уникальных сотрудников"
                      stroke="hsl(160 70% 45%)"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(160 70% 45%)', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}

          {/* Period info badges */}
          {!trendsLoading && !trendsError && trends && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
              <Badge variant="secondary">
                Период: {periodLabels[trends.period]}
              </Badge>
              <Badge variant="secondary">
                Год: {trends.year}
              </Badge>
              <Badge variant="secondary">
                Точек данных: {trends.data.length}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Utilization Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Утилизация по отделам
              </CardTitle>
              <CardDescription>
                Процент использования доступных дней отпуска по отделам
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Error state */}
          {utilizationError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 mb-4">
              <p className="text-sm text-destructive">{utilizationError}</p>
              <Button variant="outline" size="sm" onClick={() => refreshUtilization()} className="mt-2">
                Попробовать снова
              </Button>
            </div>
          )}

          {/* Loading state */}
          {utilizationLoading && (
            <div className="flex items-center justify-center h-80">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Загрузка данных...</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!utilizationLoading && !utilizationError && (!utilization?.data || utilization.data.length === 0) && (
            <div className="flex items-center justify-center h-80">
              <div className="flex flex-col items-center gap-4 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/50" />
                <div>
                  <p className="text-lg font-medium">Нет данных</p>
                  <p className="text-sm text-muted-foreground">
                    Данные об утилизации отпусков по отделам отсутствуют
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          {!utilizationLoading && !utilizationError && utilization?.data && utilization.data.length > 0 && (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={utilization.data.map((item) => ({
                    name: item.departmentName,
                    'Утилизация %': Math.round(item.utilizationPercentage),
                    'Использовано дней': item.totalDaysUsed,
                    'Доступно дней': item.totalAvailableDays,
                  }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value, name) => {
                      if (name === 'Утилизация %') return [`${value}%`, name]
                      return [value, name]
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="Утилизация %"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Utilization info badges */}
          {!utilizationLoading && !utilizationError && utilization && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
              <Badge variant="secondary">
                Год: {utilization.year}
              </Badge>
              <Badge variant="secondary">
                Отделов: {utilization.data.length}
              </Badge>
              <Badge variant="secondary">
                Норма дней: {utilization.standardDaysPerYear}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Absences Calendar View */}
      <UpcomingAbsencesCalendar
        absences={upcomingAbsences?.data || []}
        loading={upcomingAbsencesLoading}
        error={upcomingAbsencesError}
        startDate={upcomingAbsences?.startDate}
        endDate={upcomingAbsences?.endDate}
        daysCount={upcomingAbsences?.days || upcomingDays}
        onRefresh={() => fetchUpcomingAbsences(upcomingDays)}
      />
    </div>
  )
}

// Upcoming Absences Calendar Component
interface UpcomingAbsencesCalendarProps {
  absences: UpcomingAbsence[]
  loading: boolean
  error: string | null
  startDate?: string
  endDate?: string
  daysCount: number
  onRefresh: () => void
}

function UpcomingAbsencesCalendar({
  absences,
  loading,
  error,
  startDate,
  endDate,
  daysCount,
  onRefresh,
}: UpcomingAbsencesCalendarProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')

  // Generate weeks for the next 30 days
  const weeks = useMemo(() => {
    if (!startDate || !endDate) return []

    const start = parseISO(startDate)
    const end = parseISO(endDate)
    const days = eachDayOfInterval({ start, end })

    // Group days by week
    const weeksMap = new Map<string, Date[]>()

    days.forEach(day => {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 })
      const weekKey = format(weekStart, 'yyyy-MM-dd')

      if (!weeksMap.has(weekKey)) {
        weeksMap.set(weekKey, [])
      }
      weeksMap.get(weekKey)!.push(day)
    })

    return Array.from(weeksMap.entries()).map(([weekStartStr]) => {
      const weekStart = parseISO(weekStartStr)
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

      // Pad days to include full week
      const allWeekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

      return {
        weekStart,
        weekEnd,
        label: `${format(weekStart, 'd MMM', { locale: ru })} - ${format(weekEnd, 'd MMM yyyy', { locale: ru })}`,
        days: allWeekDays,
      }
    })
  }, [startDate, endDate])

  const getAbsencesForDay = (date: Date): UpcomingAbsence[] => {
    return absences.filter(absence => {
      const absenceStart = parseISO(absence.startDate)
      const absenceEnd = parseISO(absence.endDate)
      return isWithinInterval(date, { start: absenceStart, end: absenceEnd }) ||
             isSameDay(date, absenceStart) ||
             isSameDay(date, absenceEnd)
    })
  }

  // Group absences by employee for list view
  const absencesByEmployee = useMemo(() => {
    const grouped = new Map<string, { absence: UpcomingAbsence; dates: Date[] }>()

    absences.forEach(absence => {
      const key = absence.userId
      const start = parseISO(absence.startDate)
      const end = parseISO(absence.endDate)
      const dates = eachDayOfInterval({ start, end })

      if (!grouped.has(key)) {
        grouped.set(key, { absence, dates: [] })
      }
      grouped.get(key)!.dates.push(...dates)
    })

    return Array.from(grouped.values()).sort((a, b) =>
      parseISO(a.absence.startDate).getTime() - parseISO(b.absence.startDate).getTime()
    )
  }, [absences])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Предстоящие отсутствия
            </CardTitle>
            <CardDescription>
              Сотрудники в отпуске в ближайшие {daysCount} дней
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-border p-1">
              <Button
                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('calendar')}
                className="text-xs"
              >
                <Calendar className="h-4 w-4 mr-1" />
                Календарь
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="text-xs"
              >
                <User className="h-4 w-4 mr-1" />
                Список
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Error state */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 mb-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={onRefresh} className="mt-2">
              Попробовать снова
            </Button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-60">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Загрузка данных...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && absences.length === 0 && (
          <div className="flex items-center justify-center h-60">
            <div className="flex flex-col items-center gap-4 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
              <div>
                <p className="text-lg font-medium">Нет предстоящих отсутствий</p>
                <p className="text-sm text-muted-foreground">
                  Нет сотрудников в отпуске в ближайшие {daysCount} дней
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Calendar View */}
        {!loading && !error && absences.length > 0 && viewMode === 'calendar' && (
          <div className="space-y-6">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">Легенда:</span>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-primary/20 border border-primary" />
                <span>Сегодня</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-500" />
                <span>Отпуск</span>
              </div>
            </div>

            {/* Weeks */}
            <div className="space-y-4">
              {weeks.map(week => (
                <div key={week.weekStart.toISOString()} className="border rounded-lg p-4 bg-card">
                  <div className="text-sm font-medium text-muted-foreground mb-3">
                    {week.label}
                  </div>

                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {WEEKDAYS.map(day => (
                      <div key={day} className="text-center text-xs text-muted-foreground font-medium p-1">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Days */}
                  <div className="grid grid-cols-7 gap-1">
                    {week.days.map(day => {
                      const dayAbsences = getAbsencesForDay(day)
                      const hasAbsences = dayAbsences.length > 0
                      const today = isToday(day)
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6

                      return (
                        <div
                          key={day.toISOString()}
                          className={`
                            relative p-2 min-h-[60px] text-center rounded-md transition-all
                            ${today ? 'bg-primary/10 border-2 border-primary' : ''}
                            ${isWeekend && !hasAbsences ? 'bg-muted/30' : ''}
                            ${!today && !isWeekend && !hasAbsences ? 'hover:bg-muted/50' : ''}
                          `}
                          title={dayAbsences.map(a => `${a.employee.lastName} ${a.employee.firstName}`).join(', ')}
                        >
                          <div className="text-xs text-muted-foreground mb-1">
                            {format(day, 'd')}
                          </div>

                          {hasAbsences && (
                            <div className="flex flex-wrap justify-center gap-0.5">
                              {dayAbsences.slice(0, 3).map(absence => (
                                <div
                                  key={absence.id}
                                  className={`w-2 h-2 rounded-full ${getUserColor(absence.userId)}`}
                                  title={`${absence.employee.lastName} ${absence.employee.firstName}`}
                                />
                              ))}
                              {dayAbsences.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{dayAbsences.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Employee Legend */}
            <div className="border rounded-lg p-4 bg-card">
              <h4 className="font-medium text-sm mb-3">Сотрудники в отпуске</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Array.from(new Set(absences.map(a => a.userId))).map(userId => {
                  const absence = absences.find(a => a.userId === userId)!
                  return (
                    <div key={userId} className="flex items-center gap-2 text-sm">
                      <div className={`w-3 h-3 rounded ${getUserColor(userId)}`} />
                      <span className="truncate">
                        {absence.employee.lastName} {absence.employee.firstName[0]}.
                      </span>
                      <span className="text-muted-foreground text-xs">
                        ({format(parseISO(absence.startDate), 'd.MM')} - {format(parseISO(absence.endDate), 'd.MM')})
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* List View */}
        {!loading && !error && absences.length > 0 && viewMode === 'list' && (
          <div className="space-y-3">
            {absencesByEmployee.map(({ absence }) => (
              <div
                key={absence.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded ${getUserColor(absence.userId)}`} />
                  <div>
                    <div className="font-medium">
                      {absence.employee.lastName} {absence.employee.firstName}
                      {absence.employee.middleName && ` ${absence.employee.middleName}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {absence.employee.position}
                      {absence.employee.departmentName && ` • ${absence.employee.departmentName}`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    {format(parseISO(absence.startDate), 'd MMM', { locale: ru })} - {format(parseISO(absence.endDate), 'd MMM yyyy', { locale: ru })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {absence.duration} {absence.duration === 1 ? 'день' : absence.duration < 5 ? 'дня' : 'дней'} • {absence.vacationTypeName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info badges */}
        {!loading && !error && absences.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/50">
            <Badge variant="secondary">
              Период: {daysCount} дней
            </Badge>
            <Badge variant="secondary">
              Отсутствий: {absences.length}
            </Badge>
            <Badge variant="secondary">
              Сотрудников: {new Set(absences.map(a => a.userId)).size}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
