# 당일 식단 자동 수집 작업 등록 (월~토, 점심 11:10 / 저녁 17:10)
# 사용법: PowerShell에서  ./scripts/register-daily-menu-task.ps1  (관리자 권한 불필요)

$ErrorActionPreference = "Stop"
# 콘솔에 한글이 깨지지 않도록 UTF-8 출력으로 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$bat = Join-Path $PSScriptRoot "sync-daily-menu.bat"
$days = "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"  # 일요일 제외

$action = New-ScheduledTaskAction -Execute $bat

# 점심 11:10, 저녁 17:10 두 개의 트리거 (월~토)
# 봇 내부 체크 창이 11:00~11:50 / 17:00~17:50 이라 창 안쪽으로 당겨 안전하게 실행한다.
$lunch  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At 11:10am
$dinner = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At 5:10pm

# 노트북이 잠깐 꺼져 있었어도 가까운 시점에 보충 실행
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "JungleBobDailyMenu" `
  -Action $action -Trigger $lunch,$dinner -Settings $settings `
  -Description "정글밥 당일 식단 이미지 OCR 자동 수집 (월~토 점심/저녁)" -Force

Write-Host "등록 완료: JungleBobDailyMenu (월~토 11:10 / 17:10)"
Write-Host "확인: Get-ScheduledTask -TaskName JungleBobDailyMenu"
Write-Host "지금 한 번 테스트: Start-ScheduledTask -TaskName JungleBobDailyMenu"
