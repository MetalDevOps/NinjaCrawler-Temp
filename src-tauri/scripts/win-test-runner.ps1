# Runner dos executáveis do cargo no Windows (ver .cargo/config.toml).
#
# Binários de TESTE não recebem o manifest que o tauri-build embute nos bins
# (rustc-link-arg-bins), então o loader resolvia comctl32 para a 5.82 clássica
# e TaskDialogIndirect (rfd/muda, só existe na v6) ficava sem export — todo
# `cargo test` morria com STATUS_ENTRYPOINT_NOT_FOUND antes de main.
#
# Embutir o manifest via linker global conflita com o resource RT_MANIFEST dos
# bins (CVT1100 duplicate resource), então usamos o manifest EXTERNO: o loader
# lê `<exe>.manifest` quando o executável não tem manifest embutido, e ignora
# o arquivo quando tem (caso dos bins reais).
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(ValueFromRemainingArguments = $true)]$Rest
)

$manifest = Join-Path $PSScriptRoot '..\tests.manifest'
$sidecar = "$Exe.manifest"
if ((Test-Path $manifest) -and -not (Test-Path $sidecar)) {
    try { Copy-Item $manifest $sidecar } catch {}
}

& $Exe @Rest
exit $LASTEXITCODE
