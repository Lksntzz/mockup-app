Attribute VB_Name = "MKP"
Option Explicit

' Macros do Mockup da Agenda para o CorelDRAW.
'  - ArteDoClienteNoMolde: abre uma COPIA do molde, encaixa a arte do cliente (sem distorcer) e salva "<arte> - MOLDE.cdr" na pasta da arte.
'  - ExportarPDFparaMKP:   salva o PDF (predefinicao "MKP") ao lado do .cdr aberto.
' O app chama os dois por um botao; rodando a mao tambem funciona.

Const MOLDE As String = "C:\MOLDE\MOLDE.cdr"
Const LARGURA As Double = 195
Const ALTURA As Double = 255
Const CENTRO_X As Double = 104.951
Const CENTRO_Y As Double = 148.343
Const IDADE_MAXIMA_MIN As Long = 10

' Le a primeira linha do arquivo que o app deixou na pasta temporaria e apaga o arquivo.
' Arquivo velho (mais de 10 minutos) e ignorado, para nunca usar um caminho de outra hora.
Private Function LerEApagar(nome As String) As String
    Dim caminho As String, linha As String, n As Integer
    caminho = Environ("TEMP") & "\" & nome
    If Dir(caminho) = "" Then Exit Function
    If DateDiff("n", FileDateTime(caminho), Now) > IDADE_MAXIMA_MIN Then
        On Error Resume Next
        Kill caminho
        Exit Function
    End If
    n = FreeFile
    Open caminho For Input As #n
    If Not EOF(n) Then Line Input #n, linha
    Close #n
    On Error Resume Next
    Kill caminho
    LerEApagar = Trim(linha)
End Function

Private Function SemBarraFinal(ByVal s As String) As String
    s = LCase(Trim(s))
    Do While Right(s, 1) = "\"
        s = Left(s, Len(s) - 1)
    Loop
    SemBarraFinal = s
End Function

Private Function EscolherArte() As String
    Dim r As String
    On Error Resume Next
    r = Application.GetFileBox("Arquivos de arte|*.pdf;*.png;*.jpg;*.jpeg;*.tif;*.tiff", "Escolha a arte do cliente", 0)
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        r = InputBox("Cole o caminho completo do arquivo da arte do cliente:", "Arte no molde")
    End If
    EscolherArte = Replace(r, Chr(34), "")
End Function

Sub ArteDoClienteNoMolde()
    Dim arte As String, pasta As String, nomeBase As String, destino As String
    Dim doc As Document, s As Shape
    Dim pos As Long, f As Double, f2 As Double
    Dim doApp As Boolean

    If Dir(MOLDE) = "" Then
        MsgBox "Nao achei o molde em: " & MOLDE, vbExclamation, "Arte no molde"
        Exit Sub
    End If

    arte = LerEApagar("mockup-arte.txt")
    doApp = (arte <> "")
    If Not doApp Then arte = EscolherArte()
    If arte = "" Then Exit Sub
    If Dir(arte) = "" Then
        MsgBox "Nao achei o arquivo: " & arte, vbExclamation, "Arte no molde"
        Exit Sub
    End If

    pos = InStrRev(arte, "\")
    pasta = Left(arte, pos)
    nomeBase = Mid(arte, pos + 1)
    pos = InStrRev(nomeBase, ".")
    If pos > 1 Then nomeBase = Left(nomeBase, pos - 1)
    destino = pasta & nomeBase & " - MOLDE.cdr"

    If Dir(destino) <> "" Then
        If Not doApp Then MsgBox "Ja existe: " & destino & vbCrLf & "Vou abrir o que ja existe, sem alterar.", vbInformation, "Arte no molde"
        OpenDocument destino
        Exit Sub
    End If

    On Error GoTo erro
    Set doc = OpenDocument(MOLDE)
    doc.SaveAs destino
    doc.Unit = cdrMillimeter

    doc.ActivePage.ActiveLayer.Import arte
    Set s = ActiveSelection

    f = LARGURA / s.SizeWidth
    f2 = ALTURA / s.SizeHeight
    If f2 < f Then f = f2
    s.SetSize s.SizeWidth * f, s.SizeHeight * f
    s.CenterX = CENTRO_X
    s.CenterY = CENTRO_Y
    s.OrderToBack

    doc.Save
    If Not doApp Then MsgBox "Pronto: " & destino, vbInformation, "Arte no molde"
    Exit Sub

erro:
    MsgBox "Nao consegui: " & Err.Description, vbCritical, "Arte no molde"
End Sub

Sub ExportarPDFparaMKP()
    Dim doc As Document
    Dim pasta As String, nomeBase As String, destino As String, esperado As String
    Dim pos As Long
    Dim doApp As Boolean

    esperado = LerEApagar("mockup-pdf.txt")
    doApp = (esperado <> "")

    If Documents.Count = 0 Then
        MsgBox "Abra o arquivo .cdr do cliente antes.", vbExclamation, "Exportar PDF para o MKP"
        Exit Sub
    End If
    Set doc = ActiveDocument
    If Len(doc.FilePath) = 0 Or Len(doc.FileName) = 0 Then
        MsgBox "Salve o arquivo (Ctrl+S) antes de exportar.", vbExclamation, "Exportar PDF para o MKP"
        Exit Sub
    End If
    ' vindo do app: so exporta se o documento aberto for da pasta do cliente que voce escolheu la
    If doApp Then
        If SemBarraFinal(doc.FilePath) <> SemBarraFinal(esperado) Then
            MsgBox "O documento aberto no Corel (" & doc.FileName & ") nao e da pasta do cliente escolhida no app." & vbCrLf & "Deixe o .cdr certo como o documento ativo e tente de novo.", vbExclamation, "Exportar PDF para o MKP"
            Exit Sub
        End If
    End If

    pasta = doc.FilePath
    If Right(pasta, 1) <> "\" Then pasta = pasta & "\"
    pos = InStrRev(doc.FileName, ".")
    If pos > 1 Then
        nomeBase = Left(doc.FileName, pos - 1)
    Else
        nomeBase = doc.FileName
    End If
    destino = pasta & nomeBase & ".pdf"

    If Dir(destino) <> "" Then
        If MsgBox("Ja existe " & nomeBase & ".pdf nesta pasta. Substituir?", vbYesNo + vbQuestion, "Exportar PDF para o MKP") = vbNo Then Exit Sub
    End If

    On Error GoTo erroPreset
    doc.PDFSettings.Load "MKP"
    On Error GoTo erroExportar
    doc.PublishToPDF destino
    If Not doApp Then MsgBox "PDF criado: " & destino, vbInformation, "Exportar PDF para o MKP"
    Exit Sub

erroPreset:
    MsgBox "Nao achei a predefinicao de PDF chamada MKP. Crie ela primeiro (Arquivo > Publicar como PDF > Configuracoes).", vbExclamation, "Exportar PDF para o MKP"
    Exit Sub
erroExportar:
    MsgBox "Nao consegui exportar: " & Err.Description, vbCritical, "Exportar PDF para o MKP"
End Sub
