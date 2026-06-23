import json
import subprocess
import unittest
from pathlib import Path

PYTHON = Path(
    r"C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)
SCRIPT = Path(r"E:\AI\SOP\src\sop_renewal\extract_sample.py")
SOURCE = Path(r"E:\AI\SOP\旧版滚筒关键岗位SOP.xlsx")
OUTPUT = Path(r"E:\AI\SOP\.codex-work\sop-sample\sample-source.json")
IMAGE_DIR = Path(r"E:\AI\SOP\.codex-work\sop-sample\extracted")


class ExtractSampleTest(unittest.TestCase):
    def test_extracts_process_critical_fields_and_operation_images(self):
        subprocess.run(
            [
                str(PYTHON),
                str(SCRIPT),
                "--input",
                str(SOURCE),
                "--sheet",
                "安装减震器螺栓",
                "--output",
                str(OUTPUT),
                "--image-dir",
                str(IMAGE_DIR),
            ],
            check=True,
        )
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(data["job_name"], "紧固减震器螺栓")
        self.assertEqual(data["job_code"], "GT-HZ03")
        self.assertEqual(data["takt_time"], "15s")
        self.assertEqual(data["people"], 1)
        self.assertEqual(data["material"]["name"], "减震器螺栓M10*43.5")
        self.assertEqual(data["material"]["qty"], 2)
        self.assertEqual(data["tool"]["name"], "ETV DS72-30-10电枪")
        self.assertEqual(data["torque"], "20-25N.m")
        self.assertGreaterEqual(len(data["operation_images"]), 5)
        self.assertTrue(all(Path(item["path"]).exists() for item in data["operation_images"]))
        self.assertTrue(
            all(item["width"] > 0 and item["height"] > 0 for item in data["operation_images"])
        )


if __name__ == "__main__":
    unittest.main()
