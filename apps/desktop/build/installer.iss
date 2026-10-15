; Modified by The Open Forge contributors.
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef Arch
  #error Arch is required
#endif
; 品牌显示名随构建期档案（VETTA_BRAND_PROFILE）由 build-inno-installer.mjs 注入；
; 缺省回退自用口径。AppId / 安装目录 / 可执行名是跨档冻结的兼容标识，不得跟随品牌切换。
#ifndef AppDisplayName
  #define AppDisplayName "Open Forge"
#endif

[Setup]
AppId={{1A7D5D2A-E570-49DF-8615-754A66F398D5}
AppName={#AppDisplayName}
AppVerName={#AppDisplayName} {#AppVersion}
AppVersion={#AppVersion}
AppPublisher={#AppDisplayName}
DefaultDirName={localappdata}\Programs\OpenForge
DefaultGroupName={#AppDisplayName}
OutputDir={#OutputDir}
OutputBaseFilename={#AppDisplayName}-{#AppVersion}-win-{#Arch}
SetupIconFile={#SourceDir}\versions\{#AppVersion}\resources\build\icon.ico
UninstallDisplayIcon={app}\OpenForge.exe
Compression=lzma2/max
SolidCompression=no
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
AllowNoIcons=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no
MinVersion=10.0
VersionInfoVersion={#AppVersion}
Uninstallable=not IsBackgroundUpdate
CreateUninstallRegKey=not IsBackgroundUpdate

#if Arch == "x64"
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#else
  #error Unsupported architecture
#endif

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Default.isl,{#SourcePath}\installer.zh-cn.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Dirs]
Name: "{app}\versions"; Check: IsNotBackgroundUpdate

[Files]
Source: "{#SourceDir}\OpenForge.exe"; DestDir: "{app}"; Flags: ignoreversion; Check: IsNotBackgroundUpdate
Source: "{#SourceDir}\current.json"; DestDir: "{app}"; Flags: ignoreversion; Check: IsNotBackgroundUpdate
; app.asar is already an archive. Keeping it uncompressed lets the outer blockmap
; reuse unchanged chunks instead of invalidating one large LZMA2 stream.
Source: "{#SourceDir}\versions\{#AppVersion}\*"; DestDir: "{app}\versions\{#AppVersion}"; Excludes: "resources\app.asar"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsNotBackgroundUpdate
Source: "{#SourceDir}\versions\{#AppVersion}\resources\app.asar"; DestDir: "{app}\versions\{#AppVersion}\resources"; Flags: ignoreversion nocompression; Check: IsNotBackgroundUpdate
Source: "{#SourceDir}\versions\{#AppVersion}\*"; DestDir: "{code:GetUpdateVersionDirectory}"; Excludes: "resources\app.asar"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsBackgroundUpdate
Source: "{#SourceDir}\versions\{#AppVersion}\resources\app.asar"; DestDir: "{code:GetUpdateVersionDirectory}\resources"; Flags: ignoreversion nocompression; Check: IsBackgroundUpdate

[Icons]
Name: "{group}\Open Forge"; Filename: "{app}\OpenForge.exe"; Check: IsNotBackgroundUpdate
Name: "{autodesktop}\Open Forge"; Filename: "{app}\OpenForge.exe"; Tasks: desktopicon; Check: IsNotBackgroundUpdate

[Registry]
Root: HKCU; Subkey: "Software\Classes\openforge"; ValueType: string; ValueName: ""; ValueData: "URL:Open Forge Protocol"; Flags: uninsdeletekey; Check: IsNotBackgroundUpdate
Root: HKCU; Subkey: "Software\Classes\openforge"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Check: IsNotBackgroundUpdate
Root: HKCU; Subkey: "Software\Classes\openforge\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\OpenForge.exe,0"; Check: IsNotBackgroundUpdate
Root: HKCU; Subkey: "Software\Classes\openforge\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\OpenForge.exe"" ""%1"""; Check: IsNotBackgroundUpdate

[Run]
Filename: "{app}\OpenForge.exe"; Description: "{cm:LaunchProgram,Open Forge}"; Flags: nowait postinstall skipifsilent; Check: IsNotBackgroundUpdate

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\OpenForge\versions"
Type: filesandordirs; Name: "{localappdata}\OpenForge\installer"
Type: filesandordirs; Name: "{localappdata}\OpenForge\staging"
Type: files; Name: "{localappdata}\OpenForge\current.json"

[Code]
function CreateHardLinkW(
  NewFileName: String;
  ExistingFileName: String;
  SecurityAttributes: LongWord
): Boolean;
  external 'CreateHardLinkW@kernel32.dll stdcall';

function IsBackgroundUpdate(): Boolean;
begin
  Result := CompareText(ExpandConstant('{param:OPENFORGEUPDATE|false}'), 'true') = 0;
end;

function IsNotBackgroundUpdate(): Boolean;
begin
  Result := not IsBackgroundUpdate();
end;

function GetUpdateVersionDirectory(Value: String): String;
begin
  Result := AddBackslash(ExpandConstant('{param:OPENFORGESTOREROOT}')) + 'versions\{#AppVersion}';
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if IsBackgroundUpdate() and (Trim(ExpandConstant('{param:OPENFORGESTOREROOT}')) = '') then
  begin
    Log('OPENFORGESTOREROOT is required for a background update.');
    Result := False;
  end;
end;

procedure SeedUpdaterDifferentialCache();
var
  CacheDirectory: String;
  CachedBlockmapPath: String;
  CachedInstallerPath: String;
  SourceInstallerPath: String;
  TemporaryInstallerPath: String;
begin
  CacheDirectory := ExpandConstant('{localappdata}\openforge-updater');
  CachedBlockmapPath := AddBackslash(CacheDirectory) + 'current.blockmap';
  CachedInstallerPath := AddBackslash(CacheDirectory) + 'installer.exe';
  SourceInstallerPath := ExpandConstant('{srcexe}');
  TemporaryInstallerPath := AddBackslash(CacheDirectory) + 'installer.exe.installing';

  if not ForceDirectories(CacheDirectory) then
  begin
    Log('Unable to create updater cache directory: ' + CacheDirectory);
    exit;
  end;

  DeleteFile(TemporaryInstallerPath);
  if not CreateHardLinkW(TemporaryInstallerPath, SourceInstallerPath, 0) then
  begin
    if not FileCopy(SourceInstallerPath, TemporaryInstallerPath, False) then
    begin
      Log('Unable to stage updater installer cache: ' + SourceInstallerPath);
      exit;
    end;
  end;

  if FileExists(CachedInstallerPath) and not DeleteFile(CachedInstallerPath) then
  begin
    DeleteFile(TemporaryInstallerPath);
    Log('Unable to replace updater installer cache: ' + CachedInstallerPath);
    exit;
  end;

  if not RenameFile(TemporaryInstallerPath, CachedInstallerPath) then
  begin
    DeleteFile(TemporaryInstallerPath);
    Log('Unable to commit updater installer cache: ' + CachedInstallerPath);
    exit;
  end;

  { A manually installed version may replace an older cached installer. Remove
    the old blockmap so electron-updater fetches the matching versioned one. }
  DeleteFile(CachedBlockmapPath);
  Log('Updater differential cache seeded: ' + CachedInstallerPath);
end;

var
  LastReportedProgress: Integer;

procedure CurInstallProgressChanged(CurProgress, MaxProgress: Integer);
var
  CurrentProgress: Integer;
  ProgressFilePath: String;
begin
  if not IsBackgroundUpdate() then
    exit;

  ProgressFilePath := ExpandConstant('{param:OPENFORGEPROGRESS}');
  if (ProgressFilePath = '') or (MaxProgress <= 0) then
    exit;

  CurrentProgress := (CurProgress * 100) div MaxProgress;
  if CurrentProgress <> LastReportedProgress then
  begin
    LastReportedProgress := CurrentProgress;
    SaveStringToFile(
      ProgressFilePath,
      IntToStr(CurProgress) + ',' + IntToStr(MaxProgress),
      False
    );
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if IsBackgroundUpdate() then
    begin
      if not SaveStringToFile(
        AddBackslash(GetUpdateVersionDirectory('')) + '.install-complete',
        '{#AppVersion}',
        False
      ) then
        RaiseException('Failed to write update completion marker.');
    end
    else
    begin
      SeedUpdaterDifferentialCache();
      DeleteFile(ExpandConstant('{localappdata}\OpenForge\current.json'));
    end;
  end;
end;
