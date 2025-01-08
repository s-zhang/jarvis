# deploy.ps1

# 1) Git push
git push

# Variables
$remoteHost     = "192.168.20.172"
$remoteUser     = "zps"
$localRootPath  = "."
$remoteRootPath = "/Users/$remoteUser/Workspace/jarvis"
$winScpPath     = "winscp.com"
$remotePassword = Read-Host -Prompt "Enter remote password" -AsSecureString
$localFiles    = @(,".\.env")
$localFolders  = @(,".\secrets")

$remotePassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($remotePassword))

# Resolve local root path to full path
$localRootPath = (Get-Item -Path $localRootPath).FullName

# 2) WinSCP upload of .env and secrets
$commands = @(
    'option batch on',
    'option confirm off',
    "open sftp://$($remoteUser):$($remotePassword)@$($remoteHost)/"
)

function Get-RemotePath {
    param (
        [string]$path
    )

    # Resolve full path of file
    $fullPath = (Get-Item -Path $path).FullName

    # Get file path relative to $localRootPath
    $relativePath = $fullPath.Substring($localRootPath.Length + 1).Replace('\', '/')

    # Get full remote path
    return "$remoteRootPath/$relativePath"
}

foreach ($file in $localFiles) {
    $remotePath = Get-RemotePath -path $file
    $commands += "put `"$file`" `"$remotePath`""
}

function Add-FolderToCommands {
    param (
        [string]$folder,
        [string[]]$commands
    )

    $items = Get-ChildItem -Path $folder -Recurse
    foreach ($item in $items) {
        if ($item.PSIsContainer) {
            continue
        }
        $remotePath = Get-RemotePath -path $item.FullName
        $commands += "put `"$($item.FullName)`" `"$remotePath`""
    }
    return $commands
}

foreach ($folder in $localFolders) {
    $remotePath = Get-RemotePath -path $folder
    # Ensure remote path is a subpath of remote root path
    if (-not $remotePath.StartsWith($remoteRootPath)) {
        Write-Host "Folder path '$folder' is not a subpath of remote root path '$remoteRootPath'."
        exit 1
    }
    $commands += "rm `"$remotePath/*`""
    $commands = Add-FolderToCommands -folder $folder -commands $commands
}

$commands += 'exit'

& $winScpPath /command $commands

# 3) SSH: update repo, install deps, kill pm2, then start via pm2
plink -batch "$remoteUser@$remoteHost" -pw $remotePassword `
  "source ~/.zprofile && \
   cd $remoteRootPath && \
   git reset --hard HEAD && \
   git pull && \
   npm install && \
   pm2 delete jarvis 2> /dev/null && \
   pm2 start npm --name jarvis -- run prod"

Write-Host "Deployment complete. Use 'pm2 logs jarvis' to view logs on the remote machine."
