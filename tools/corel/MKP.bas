Attribute VB_Name = "MKP"
Option Explicit

' Macros do Mockup da Agenda para o CorelDRAW.
'  - ArteDoClienteNoMolde: abre uma COPIA do molde, encaixa a frente (pagina 1) e o verso (pagina 2) sem distorcer e salva "<arte> - MOLDE.cdr" na pasta do cliente.
'  - ExportarPDFparaMKP:   salva o PDF (predefinicao "MKP") ao lado do .cdr aberto.
' O app chama os dois por um botao; rodando a mao tambem funciona.

Const MOLDE As String = "C:\MOLDE\MOLDE.cdr"
Const LARGURA As Double = 195
Const ALTURA As Double = 255
Const CENTRO_X As Double = 104.951
Const CENTRO_Y As Double = 148.343
Const IDADE_MAXIMA_MIN As Long = 10

' Le o arquivo que o app deixou na pasta temporaria (uma informacao por linha) e apaga o arquivo.
' Arquivo velho (mais de 10 minutos) e ignorado, para nunca usar um caminho de outra hora.
Private Function LerLinhasEApagar(nome As String) As String()
    Dim caminho As String, linha As String, n As Integer, i As Integer
    Dim r(0 To 2) As String
    caminho = Environ("TEMP") & "\" & nome
    LerLinhasEApagar = r
    If Dir(caminho) = "" Then Exit Function
    If DateDiff("n", FileDateTime(caminho), Now) > IDADE_MAXIMA_MIN Then
        On Error Resume Next
        Kill caminho
        Exit Function
    End If
    n = FreeFile
    Open caminho For Input As #n
    Do While Not EOF(n) And i <= 2
        Line Input #n, linha
        r(i) = Trim(linha)
        i = i + 1
    Loop
    Close #n
    On Error Resume Next
    Kill caminho
    LerLinhasEApagar = r
End Function

Private Function LerEApagar(nome As String) As String
    Dim l() As String
    l = LerLinhasEApagar(nome)
    LerEApagar = l(0)
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

' Importa a arte na pagina indicada do molde (1 = frente, 2 = verso), encaixa sem distorcer e centraliza.
Private Sub ColocarArte(doc As Document, pagina As Long, arquivo As String)
    Dim s As Shape, f As Double, f2 As Double
    If doc.Pages.Count < pagina Then Err.Raise vbObjectError + 1, , "O molde nao tem a pagina " & pagina & "."
    doc.Pages(pagina).Activate
    doc.Pages(pagina).ActiveLayer.Import arquivo
    Set s = ActiveSelection
    f = LARGURA / s.SizeWidth
    f2 = ALTURA / s.SizeHeight
    If f2 < f Then f = f2
    s.SetSize s.SizeWidth * f, s.SizeHeight * f
    s.CenterX = CENTRO_X
    s.CenterY = CENTRO_Y
    s.OrderToBack
End Sub

' Arquivo do app: linha 1 = onde salvar o .cdr, linha 2 = arte da frente (pagina 1), linha 3 = arte do verso (pagina 2).
' Rodando a mao: pergunta a frente e o verso, e salva na pasta da frente.
Sub ArteDoClienteNoMolde()
    Dim l() As String
    Dim destino As String, frente As String, verso As String
    Dim pasta As String, nomeBase As String
    Dim doc As Document
    Dim pos As Long
    Dim doApp As Boolean

    If Dir(MOLDE) = "" Then
        MsgBox "Nao achei o molde em: " & MOLDE, vbExclamation, "Arte no molde"
        Exit Sub
    End If

    l = LerLinhasEApagar("mockup-arte.txt")
    destino = l(0)
    frente = l(1)
    verso = l(2)
    doApp = (destino <> "")

    If Not doApp Then
        frente = EscolherArte()
        If frente = "" Then Exit Sub
        verso = Replace(Trim(InputBox("Cole o caminho da arte do VERSO (ou deixe vazio para criar o verso depois):", "Arte no molde")), Chr(34), "")
        pos = InStrRev(frente, "\")
        pasta = Left(frente, pos)
        nomeBase = Mid(frente, pos + 1)
        pos = InStrRev(nomeBase, ".")
        If pos > 1 Then nomeBase = Left(nomeBase, pos - 1)
        destino = pasta & nomeBase & " - MOLDE.cdr"
    End If

    If frente <> "" Then
        If Dir(frente) = "" Then
            MsgBox "Nao achei o arquivo da frente: " & frente, vbExclamation, "Arte no molde"
            Exit Sub
        End If
    End If
    If verso <> "" Then
        If Dir(verso) = "" Then
            MsgBox "Nao achei o arquivo do verso: " & verso, vbExclamation, "Arte no molde"
            Exit Sub
        End If
    End If
    If frente = "" And verso = "" Then Exit Sub

    If Dir(destino) <> "" Then
        If Not doApp Then MsgBox "Ja existe: " & destino & vbCrLf & "Vou abrir o que ja existe, sem alterar.", vbInformation, "Arte no molde"
        OpenDocument destino
        Exit Sub
    End If

    On Error GoTo erro
    Set doc = OpenDocument(MOLDE)
    doc.SaveAs destino
    doc.Unit = cdrMillimeter
    If frente <> "" Then ColocarArte doc, 1, frente
    If verso <> "" Then ColocarArte doc, 2, verso
    doc.Pages(1).Activate
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
