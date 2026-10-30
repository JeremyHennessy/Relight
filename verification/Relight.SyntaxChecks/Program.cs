using System;
using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

internal static class Program
{
    private static int Main()
    {
        string root = Path.Combine(Environment.CurrentDirectory, "Assets");
        if (!Directory.Exists(root))
        {
            Console.Error.WriteLine("Assets directory not found; run from repository root.");
            return 2;
        }

        int files = 0;
        int errors = 0;
        foreach (var file in Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories))
        {
            var syntax = CSharpSyntaxTree.ParseText(File.ReadAllText(file),
                new CSharpParseOptions(LanguageVersion.Latest), file);
            files++;
            var diagnostics = syntax.GetDiagnostics()
                .Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
            foreach (var diagnostic in diagnostics)
            {
                Console.Error.WriteLine(diagnostic.ToString());
                errors++;
            }
            Console.WriteLine((diagnostics.Length == 0 ? "SYNTAX OK " : "SYNTAX ERROR ") + file);
        }

        if (files < 4)
        {
            Console.Error.WriteLine("Unexpectedly few Unity C# files: " + files);
            return 2;
        }
        Console.WriteLine("Checked " + files + " Unity C# files; syntax errors: " + errors +
            ". This is not Unity compilation or API verification.");
        return errors == 0 ? 0 : 1;
    }
}
