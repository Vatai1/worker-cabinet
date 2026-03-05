import { useState, useEffect } from 'react'
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
import { useAnalyticsStore } from '@/store/analyticsStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { TrendPeriod } from '@/types'
import {
  TrendingUp,
  Calendar,
  Users,
  BarChart3,
  RefreshCw,
  LineChart as LineChartIcon,
  Building2,
} from 'lucide-react'

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
  } = useAnalyticsStore()

  const [period, setPeriod] = useState<TrendPeriod>('monthly')
  const [year] = useState(new Date().getFullYear())
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const [utilizationYear] = useState(new Date().getFullYear())

  useEffect(() => {
    fetchTrends(period, year)
  }, [period, year, fetchTrends])

  useEffect(() => {
    fetchUtilization(utilizationYear)
  }, [utilizationYear, fetchUtilization])

  const handleRefresh = () => {
    refreshTrends()
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
    </div>
  )
}
