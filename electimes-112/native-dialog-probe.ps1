param([int]$OfficeProcess, [string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class NativePrintProbe {
 public delegate bool EnumProc(IntPtr h, IntPtr p);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p,IntPtr x);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h,EnumProc p,IntPtr x);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetAwarenessFromDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 public class Window {public long handle;public string title,kind;public int awareness;public uint dpi;public bool visible;public RECT rect;public List<Window> children;public Window owner;}
 public static Window Read(IntPtr h,bool children=false) {
  var s=new StringBuilder(512); GetWindowText(h,s,512);var c=new StringBuilder(128);GetClassName(h,c,128);RECT r;GetWindowRect(h,out r);
  var w=new Window{handle=h.ToInt64(),title=s.ToString(),kind=c.ToString(),rect=r,awareness=GetAwarenessFromDpiAwarenessContext(GetWindowDpiAwarenessContext(h)),dpi=GetDpiForWindow(h),visible=IsWindowVisible(h)};
  if(children){var owner=GetWindow(h,4);if(owner!=IntPtr.Zero)w.owner=Read(owner);w.children=new List<Window>();EnumChildWindows(h,(a,b)=>{if(IsWindowVisible(a))w.children.Add(Read(a));return true;},IntPtr.Zero);}return w;
 }
 public static Window[] Dialogs(int pid) {
  var list=new List<Window>();EnumWindows((h,x)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==pid&&IsWindowVisible(h)){var w=Read(h,true);if(w.kind=="#32770")list.Add(w);}return true;},IntPtr.Zero);return list.ToArray();
 }
}
'@
$deadline=(Get-Date).AddSeconds(50)
do {
 $dialogs=@([NativePrintProbe]::Dialogs($OfficeProcess))
 if($dialogs.Count -gt 0){break}
 Start-Sleep -Milliseconds 150
}while((Get-Date) -lt $deadline)
if($dialogs.Count -eq 0){throw 'Native print dialog did not appear'}
Start-Sleep -Milliseconds 350
$dialogs=@([NativePrintProbe]::Dialogs($OfficeProcess))
$dialogs | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Output -Encoding UTF8
# Public validation artifacts contain only the synthetic test print dialog.
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$screen=[Windows.Forms.SystemInformation]::VirtualScreen
$rect=$dialogs[0].rect
$x=[Math]::Max($screen.Left,$rect.L);$y=[Math]::Max($screen.Top,$rect.T)
$width=[Math]::Min($screen.Right,$rect.R)-$x;$height=[Math]::Min($screen.Bottom,$rect.B)-$y
if($width -gt 0 -and $height -gt 0){
 $bitmap=New-Object Drawing.Bitmap($width,$height)
 $graphics=[Drawing.Graphics]::FromImage($bitmap)
 try{$graphics.CopyFromScreen($x,$y,0,0,$bitmap.Size);$bitmap.Save(([IO.Path]::ChangeExtension($Output,'png')),[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
}
foreach($dialog in $dialogs){[NativePrintProbe]::PostMessage([IntPtr]$dialog.handle,0x10,[IntPtr]::Zero,[IntPtr]::Zero)|Out-Null}
