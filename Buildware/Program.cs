using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace Buildware
{
    class Program
    {
        public static string ThumbnailDirectory = "gallerythumbnails";
        public class FileInfo
        {
            public enum Mediums
            {
                Physical,
                Digital,
                Audio,
                Video,
                Unknown
            }
            public FileInfo( string filename, string path, string root)
            { 
                Filename = Path.Combine( path, Path.GetFileName(filename));
                filename = Path.GetFileName(filename);

                var index = filename.LastIndexOf('.');
                if (index >= 0)
                {
                    Extension = filename.Substring(index + 1);
                    var info = filename.Substring(0, filename.Length - Extension.Length - 1);

                    var words = info.Split(' ');
                    if (words.Length >= 2)
                    {
                        Name = words[0] + ' ' + words[1];
                        LastName = words[1];
                    }
                    if (words.Length > 2)
                        Title = string.Join(' ', words, 2, words.Length - 2);

                    switch (Extension.ToUpper())
                    {
                        case "JPG":
                        case "JPEG":
                            Medium = Mediums.Physical;
                            break;
                        case "PNG":
                            Medium = Mediums.Digital;
                            break;
                        case "MP3":
                        case "M4A":
                        case "WAV":
                            Medium = Mediums.Audio;
                            break;
                        case "MP4":
                        case "MOV":
                        case "WEBM":
                        case "HEIC":
                            Medium = Mediums.Video;
                            break;
                    }

                    if (Medium == Mediums.Physical || Medium == Mediums.Digital)
                    {
                        ThumbnailFilename = Path.Combine(ThumbnailDirectory, path.Replace('\\', '.') + filename);
                        if (!File.Exists(Path.Combine(root, ThumbnailFilename)))
                            CreateThumbnail(Path.Combine(root, Filename), Path.Combine(root, ThumbnailFilename), 150);
                    }

                }
            }

            public string Filename;
            public string ThumbnailFilename;
            public string Extension;
            public string Name = "Anonymous";
            public string LastName = "Anonymouse";
            public string Title = "Untitled";
            public Mediums Medium = Mediums.Unknown;

            private void CreateThumbnail(string originalFile, string thumbnailFile, int newWidth)
            {
                try
                {
                    using (var image = Image.FromFile(originalFile))
                    {
                        var newHeight = (int)((float)newWidth / image.Width * image.Height);

                        using (var thumbnail = new Bitmap(newWidth, newHeight))
                        {
                            using (var graphic = System.Drawing.Graphics.FromImage(thumbnail))
                            {
                                graphic.InterpolationMode = InterpolationMode.HighQualityBicubic;
                                graphic.SmoothingMode = SmoothingMode.HighQuality;
                                graphic.PixelOffsetMode = PixelOffsetMode.HighQuality;
                                graphic.CompositingQuality = CompositingQuality.HighQuality;

                                graphic.DrawImage(image, 0, 0, newWidth, newHeight);

                                var info = ImageCodecInfo.GetImageEncoders();
                                var encoderParameters = new EncoderParameters(1);
                                encoderParameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 100L);
                                thumbnail.Save(thumbnailFile, info[1], encoderParameters);
                            }
                        }
                    }
                }
                catch
                {
                    Console.Write($"Image cannot load - {originalFile}");
                }
            }




        }
        static void Main(string[] args)
        {
            var rootDir = Directory.GetCurrentDirectory();
            if (args.Length > 0)
            {
                if (args[0] == "?" || args[0] == "/h")
                {
                    Console.WriteLine("Buildware [public directory]");
                    return;
                }
                
                rootDir = args[0];
            }
            var publicDir = rootDir;
//            var publicDir = Path.Combine(rootDir, "public");
            var gallery = Path.Combine(publicDir, "galleryimages");
            var thumbnailGallery = Path.Combine(publicDir, ThumbnailDirectory);

            if (!Directory.Exists(thumbnailGallery))
                Directory.CreateDirectory(thumbnailGallery);

            var fileInfos = new List<FileInfo>();
            WalkFolder(publicDir, "galleryimages", fileInfos);
            fileInfos = fileInfos.OrderBy(x => x.LastName).ToList();
            var webpage = CreateGallery( publicDir, fileInfos);
            foreach (var file in fileInfos)
                if( file.Medium == FileInfo.Mediums.Unknown)
                    Console.WriteLine($"unknown filetype = {file.Filename}");
            File.WriteAllText(Path.Combine(publicDir, "gallery.html"), webpage);
        }

        static string CreateGallery( string publicDir, IEnumerable<FileInfo> fileInfos)
        {
            StringBuilder builder = new StringBuilder();

            var template = File.ReadAllText(Path.Combine(publicDir, "gallerytemplate.html"));
            if( !string.IsNullOrEmpty( template))
            {
                while ( template.Length > 0) 
                    template = PeelRepeatSection( template, builder, fileInfos);
                builder.Append(template);
            }
            Console.WriteLine($"Template not found = {Path.Combine(publicDir, "gallerytemplate.html")}");


            return builder.ToString();
        }

        static string PeelRepeatSection( String template, StringBuilder builder, IEnumerable<FileInfo> fileInfos)
        {
            var sections = template.Split("$$-");
            if (sections.Length < 4)
                return "";
            var initial = sections[0];
            var header = sections[1];
            var body = sections[2];
            var footer = sections[3];

            builder.Append(initial);

            var medium = GetMediumFromHeader(header);
            int id = 1;
            foreach( var fileInfo in fileInfos)
            {
                if( fileInfo.Medium == medium)
                {
                    body = body.Replace("{Filename}", "{0}");
                    body = body.Replace("{Title}", "{1}");
                    body = body.Replace("{Name}", "{2}");
                    body = body.Replace("{Id}", "{3}");
                    body = body.Replace("{Thumbnail}", "{4}");
                    builder.Append( string.Format(body, fileInfo.Filename, fileInfo.Title, fileInfo.Name, id, fileInfo.ThumbnailFilename));
                }
                id++;
            }
     
            if (sections.Length == 5)
                builder.Append(sections[4]);
            if (sections.Length > 5)
                return string.Join("$$-", sections, 4, sections.Length - 4);
            return "";
        }

        static FileInfo.Mediums GetMediumFromHeader( string header)
        {
            if (header.IndexOf("Digital") > 0)
                return FileInfo.Mediums.Digital;
            if (header.IndexOf("Physical") > 0)
                return FileInfo.Mediums.Physical;
            if (header.IndexOf("Audio") > 0)
                return FileInfo.Mediums.Audio;
            if (header.IndexOf("Video") > 0)
                return FileInfo.Mediums.Video;
            return FileInfo.Mediums.Unknown;
        }

        static void WalkFiles( string root, string path, List<FileInfo> files)
        {
            foreach (var filename in Directory.GetFiles(Path.Combine( root, path)))
            {
                files.Add(new FileInfo( Path.GetFileName( filename), path, root));
            }
        }
        static void WalkFolder(string root, string path, List<FileInfo> fileInfos)
        {
            WalkFiles(root, path, fileInfos);
            foreach (var pathname in Directory.GetDirectories(Path.Combine(root, path)))
                WalkFolder(root, Path.Combine( path, Path.GetFileName( pathname)), fileInfos);
        }
    }
}

