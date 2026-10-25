// Layout-only fixture: no input injection, target activation, or user-window control.
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
class HudLayoutFixture {
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr window,int id);
    static void Check(bool condition,string message) { if(!condition)throw new Exception(message); }
    static void CheckRegion(Control control) {
        using(var bitmap=new Bitmap(1,1)) using(var graphics=Graphics.FromImage(bitmap)) {
            RectangleF bounds=control.Region.GetBounds(graphics);
            Check(Math.Abs(bounds.Width-control.Width)<1 && Math.Abs(bounds.Height-control.Height)<1,
                "Stale clipping region: "+control.Text+" "+bounds+" vs "+control.Size);
        }
    }
    [STAThread] static int Main(string[] args) {
        try {
            Application.EnableVisualStyles();
            var type=Assembly.LoadFrom(args[0]).GetType("ComputerUse").GetNestedType("StopWindow",BindingFlags.NonPublic);
            var layout=type.GetMethod("LayoutForDisplay",BindingFlags.Instance|BindingFlags.NonPublic);
            Check(layout!=null,"DPI layout missing");
            Directory.CreateDirectory(args[1]);
            using(var hud=(Form)Activator.CreateInstance(type,true)) {
                // Rendering requires a handle. Release only this test instance's
                // hotkey immediately; never show it or change foreground focus.
                IntPtr handle=hud.Handle;
                UnregisterHotKey(handle,1);
                foreach(int dpi in new int[]{96,120,144,192,144,96}) {
                    layout.Invoke(hud,new object[]{dpi,new Rectangle(0,0,1920,1080)});
                    CheckRegion(hud);
                    Button stop=null;
                    foreach(Control control in hud.Controls) {
                        Check(hud.ClientRectangle.Contains(control.Bounds),"Control clipped: "+control.Text);
                        Check(control.Font.Height<=control.Height,"Text height clipped: "+control.Text);
                        Check(hud.Region.IsVisible(control.Bounds),"Control outside visible region: "+control.Text);
                        if(control is Button) {stop=(Button)control;CheckRegion(control);}
                    }
                    Check(stop!=null && stop.Text.Contains("STOP"),"STOP missing");
                    Check(TextRenderer.MeasureText(stop.Text,stop.Font).Width<=stop.Width,"STOP text clipped");
                    foreach(Control control in hud.Controls) if(control is Label)
                        Check(control.Right<=stop.Left,"Label overlaps STOP: "+control.Text);
                    using(var bitmap=new Bitmap(hud.Width,hud.Height)) {
                        hud.DrawToBitmap(bitmap,hud.ClientRectangle);
                        // Hidden forms skip their children in DrawToBitmap.
                        // Render each actual control without showing a desktop UI.
                        foreach(Control control in hud.Controls) control.DrawToBitmap(bitmap,control.Bounds);
                        bitmap.Save(Path.Combine(args[1],"hud-"+dpi+".png"),ImageFormat.Png);
                    }
                    // Reproduce the original WinForms size/region divergence.
                    hud.Scale(new SizeF(1.5f,1.5f));
                    CheckRegion(hud);CheckRegion(stop);
                    layout.Invoke(hud,new object[]{dpi,new Rectangle(-640,0,640,1080)});
                    Check(hud.Width<=640,"HUD exceeds narrow working area");
                    foreach(Control control in hud.Controls)
                        Check(hud.ClientRectangle.Contains(control.Bounds),"Narrow layout clipped: "+control.Text);
                    Console.WriteLine("HUD_LAYOUT_PASS dpi="+dpi);
                }
            }
            return 0;
        } catch(Exception error) {Console.Error.WriteLine(error);return 1;}
    }
}
