@echo off
set NODE=C:\Users\kmika\node\node-v20.18.3-win-x64
set RAILWAY=%NODE%\railway.exe
set PATH=%NODE%;%PATH%
cd /d C:\Users\kmika\Desktop\line-crm

echo ============================================
echo  LINE CRM デプロイスクリプト
echo ============================================
echo.

REM --- STEP 1: .envチェック ---
findstr /c:"ここに" .env >nul 2>&1
if %errorlevel%==0 (
  echo [エラー] .env に認証情報が入力されていません。
  echo .env ファイルを開いて全ての値を入力してください。
  pause
  exit /b 1
)
echo [OK] .env 確認済み
echo.

REM --- STEP 2: Railway ログイン ---
echo [STEP 1/4] Railway にログインします
echo ブラウザが開きます。Googleアカウントなどでサインアップしてください。
echo.
%RAILWAY% login
if %errorlevel% neq 0 (
  echo ログインに失敗しました
  pause
  exit /b 1
)
echo [OK] ログイン完了
echo.

REM --- STEP 3: プロジェクト作成 ---
echo [STEP 2/4] Railway プロジェクトを作成します
%RAILWAY% init --name line-crm
echo [OK] プロジェクト作成完了
echo.

REM --- STEP 4: 環境変数を Railway に設定 ---
echo [STEP 3/4] 環境変数を設定します
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  echo %%A | findstr /r "^#" >nul
  if errorlevel 1 (
    if not "%%A"=="" (
      if not "%%B"=="" (
        %RAILWAY% variables set "%%A=%%B" >nul 2>&1
        echo   設定: %%A
      )
    )
  )
)
echo [OK] 環境変数設定完了
echo.

REM --- STEP 5: デプロイ ---
echo [STEP 4/4] デプロイ中...
%RAILWAY% up --detach
if %errorlevel% neq 0 (
  echo デプロイに失敗しました
  pause
  exit /b 1
)
echo.
echo ============================================
echo  デプロイ完了!
echo ============================================
echo.
echo 発行されたURLを確認します:
%RAILWAY% domain
echo.
echo 上記のURLを LINE と スマレジの Webhook に設定してください。
echo   LINE    : https://[URL]/webhook/line
echo   スマレジ: https://[URL]/webhook/smaregi
echo.
pause
