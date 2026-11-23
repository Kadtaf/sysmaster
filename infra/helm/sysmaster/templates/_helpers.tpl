{{- define "sysmaster.fullname" -}}
{{- printf "%s" .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}

{{- define "sysmaster.tag" -}}
{{- .Values.image.tag | default .Chart.AppVersion -}}
{{- end -}}

{{- define "sysmaster.labels" -}}
app.kubernetes.io/name: sysmaster
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ include "sysmaster.tag" . | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "sysmaster.selector" -}}
app.kubernetes.io/name: sysmaster
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* Conteneur non root, système de fichiers en lecture seule, aucune capacité. */}}
{{- define "sysmaster.containerSecurity" -}}
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities: { drop: [ALL] }
  seccompProfile: { type: RuntimeDefault }
{{- end -}}

{{- define "sysmaster.apiEnv" -}}
- name: NODE_ENV
  value: production
- name: APP_VERSION
  value: {{ include "sysmaster.tag" . | quote }}
- name: DATABASE_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.existingSecret }}, key: DATABASE_URL } }
{{- end -}}
