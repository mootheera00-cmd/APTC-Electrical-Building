// APTC-Electrical and Building - desktop launcher.
// Starts the FastAPI backend (8000/8010) and the Vite frontend on port 1183,
// then opens the browser. Compile to APTC-Electrical-and-Building.exe with build-launcher.bat.

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;

internal static class AptcLauncher
{
    private const int FrontendPort = 1183;
    private static readonly int[] BackendPorts = new int[] { 8000, 8010 };

    private static int Main()
    {
        Console.Title = "APTC-Electrical and Building";
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string backendDir = Path.Combine(root, "backend");
        string frontendDir = Path.Combine(root, "frontend");

        Console.WriteLine("============================================================");
        Console.WriteLine("  APTC-Electrical and Building");
        Console.WriteLine("  launcher - backend + frontend");
        Console.WriteLine("============================================================");
        Console.WriteLine();

        if (!File.Exists(Path.Combine(backendDir, "app", "main.py")) || !Directory.Exists(frontendDir))
        {
            Console.WriteLine("[ERROR] backend\\app\\main.py and frontend\\ must sit next to this exe.");
            Console.WriteLine("        looked in: " + root);
            return Stop(1);
        }

        if (!Free(FrontendPort))
        {
            Console.WriteLine("[INFO]  port " + FrontendPort + " is already listening - opening the app.");
            Browse("http://localhost:" + FrontendPort);
            return Stop(0);
        }

        int api = 0;
        for (int i = 0; i < BackendPorts.Length; i++)
        {
            if (Free(BackendPorts[i]))
            {
                api = BackendPorts[i];
                break;
            }
        }
        if (api == 0)
        {
            Console.WriteLine("[ERROR] backend ports 8000 and 8010 are both busy.");
            Console.WriteLine("        close the previous run (stop.bat) and try again.");
            return Stop(1);
        }

        string node = NodeDir();
        if (node == null)
        {
            Console.WriteLine("[WARN]  npm was not found on PATH (Node.js 20+ is required).");
        }
        if (!Directory.Exists(Path.Combine(frontendDir, "node_modules")))
        {
            Console.WriteLine("[WARN]  frontend\\node_modules is missing - run:  cd frontend  then  npm install");
        }

        Console.WriteLine();
        Console.WriteLine("  Backend  : http://localhost:" + api + "   (API docs: /docs)");
        Console.WriteLine("  Frontend : http://localhost:" + FrontendPort);
        Console.WriteLine("  LAN      : http://" + LanIp() + ":" + FrontendPort);
        Console.WriteLine();

        Run(backendDir, "title APTC Backend :" + api
            + " & python -m uvicorn app.main:app --port " + api + " --host 0.0.0.0");
        Console.WriteLine("[OK]    backend window opened  (uvicorn :" + api + ")");

        string path = node == null ? "" : "set \"PATH=" + node + ";%PATH%\" && ";
        Run(frontendDir, "title APTC Frontend :" + FrontendPort + " & " + path
            + "set \"VITE_API_PORT=" + api + "\" && npm run dev -- --port " + FrontendPort + " --host --strictPort");
        Console.WriteLine("[OK]    frontend window opened (vite :" + FrontendPort + ")");

        Console.WriteLine();
        Console.WriteLine("Starting up - the browser opens in a few seconds ...");
        Thread.Sleep(8000);
        Browse("http://localhost:" + FrontendPort);

        Console.WriteLine();
        Console.WriteLine("Close the two server windows to stop the app.");
        return Stop(0);
    }

    private static int Stop(int code)
    {
        Console.WriteLine();
        Console.WriteLine("Press Enter to close this window (the servers keep running) ...");
        try { Console.ReadLine(); }
        catch { }
        return code;
    }

    private static bool Free(int port)
    {
        TcpListener listener = null;
        try
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            return true;
        }
        catch (SocketException)
        {
            return false;
        }
        finally
        {
            if (listener != null)
            {
                try { listener.Stop(); }
                catch { }
            }
        }
    }

    private static string NodeDir()
    {
        string path = Environment.GetEnvironmentVariable("PATH");
        if (path != null)
        {
            string[] parts = path.Split(';');
            for (int i = 0; i < parts.Length; i++)
            {
                string dir = parts[i].Trim();
                if (dir.Length > 0 && HasNpm(dir)) return dir;
            }
        }

        string[] known = new string[]
        {
            @"D:\node\node-v24.13.0-win-x64",
            @"C:\Program Files\nodejs",
            @"C:\Program Files (x86)\nodejs",
            @"C:\node"
        };
        for (int i = 0; i < known.Length; i++)
        {
            if (HasNpm(known[i])) return known[i];
        }

        try
        {
            if (Directory.Exists(@"D:\node"))
            {
                string[] dirs = Directory.GetDirectories(@"D:\node");
                for (int i = 0; i < dirs.Length; i++)
                {
                    if (HasNpm(dirs[i])) return dirs[i];
                }
            }
        }
        catch { }

        return null;
    }

    private static bool HasNpm(string dir)
    {
        try
        {
            return File.Exists(Path.Combine(dir, "npm.cmd"));
        }
        catch
        {
            return false;
        }
    }

    private static string LanIp()
    {
        try
        {
            IPAddress[] addrs = Dns.GetHostAddresses(Dns.GetHostName());
            for (int i = 0; i < addrs.Length; i++)
            {
                IPAddress a = addrs[i];
                if (a.AddressFamily != AddressFamily.InterNetwork || IPAddress.IsLoopback(a)) continue;
                string s = a.ToString();
                if (!s.StartsWith("169.254.")) return s;
            }
        }
        catch { }
        return "localhost";
    }

    private static void Run(string workingDirectory, string command)
    {
        ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/k " + command);
        psi.WorkingDirectory = workingDirectory;
        psi.UseShellExecute = true;
        Process.Start(psi);
    }

    private static void Browse(string url)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(url);
            psi.UseShellExecute = true;
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            Console.WriteLine("[WARN]  open " + url + " manually  (" + ex.Message + ")");
        }
    }
}
