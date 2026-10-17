import { useState } from "react";
import { TYPE_PROVIDER } from "@/types";
import { SPEECH_TO_TEXT_PROVIDERS } from "@/config";
import { useApp } from "@/contexts";
import {
  addCustomSttProvider,
  getCustomSttProviders,
  removeCustomSttProvider,
  updateCustomSttProvider,
  validateCurl,
} from "@/lib";

export function useCustomSttProviders() {
  const { loadData } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<TYPE_PROVIDER>({
    id: "",
    name: "",
    baseUrl: "",
    apiKey: "",
    protocol: "openai",
    streaming: false,
    responseContentPath: "text",
    isCustom: true,
    curl: "",
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleEdit = (providerId: string) => {
    const customProviders = getCustomSttProviders();
    const provider = customProviders.find((p) => p.id === providerId);
    if (!provider) return;

    setFormData({
      ...provider,
    });
    setEditingProvider(providerId);
    setShowForm(!showForm);
    setErrors({});
  };

  const handleAutoFill = (providerId: string) => {
    const provider = SPEECH_TO_TEXT_PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;

    setFormData({
      ...provider,
      curl: provider.curl,
    });

    setErrors({});
  };

  const handleDelete = (providerId: string) => {
    setDeleteConfirm(providerId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const success = removeCustomSttProvider(deleteConfirm);
      if (success) {
        setDeleteConfirm(null);
        loadData(); // Refresh data
      }
    } catch (error) {
      console.error("Error deleting custom provider:", error);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  const handleSave = async (overrideData?: Partial<TYPE_PROVIDER>) => {
    const dataToSave = { ...formData, ...(overrideData || {}) };
    // Validate form
    const newErrors: { [key: string]: string } = {};

    if (!dataToSave.curl.trim()) {
      newErrors.curl = "Curl command or Base URL is required";
    } else {
      const hasAudioVar = dataToSave.curl.includes("{{AUDIO}}");

      if (!hasAudioVar) {
        newErrors.curl = "cURL command must contain {{AUDIO}}.";
      } else {
        const validation = validateCurl(dataToSave.curl, []);
        if (!validation.isValid) {
          newErrors.curl = validation.message || "";
        }
      }
    }

    if (!dataToSave.responseContentPath?.trim()) {
      newErrors.responseContentPath = "Response content path is required";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      if (editingProvider) {
        // Update existing provider
        const success = updateCustomSttProvider(editingProvider, {
          name: dataToSave.name,
          baseUrl: dataToSave.baseUrl,
          apiKey: dataToSave.apiKey,
          protocol: dataToSave.protocol,
          curl: dataToSave.curl,
          streaming: false,
          responseContentPath: dataToSave.responseContentPath,
        });

        if (success) {
          setEditingProvider(null);
          setShowForm(false);
          setFormData({
            id: "",
            name: "",
            baseUrl: "",
            apiKey: "",
            protocol: "openai",
            streaming: false,
            responseContentPath: "text",
            isCustom: true,
            curl: "",
          });
          loadData(); // Refresh data
        }
      } else {
        // Create new provider
        const newProvider = {
          name: dataToSave.name,
          baseUrl: dataToSave.baseUrl,
          apiKey: dataToSave.apiKey,
          protocol: dataToSave.protocol,
          curl: dataToSave.curl,
          streaming: false,
          responseContentPath: dataToSave.responseContentPath,
        };

        const saved = addCustomSttProvider(newProvider);
        if (saved) {
          setShowForm(false);
          setFormData({
            id: "",
            name: "",
            baseUrl: "",
            apiKey: "",
            protocol: "openai",
            streaming: false,
            responseContentPath: "text",
            isCustom: true,
            curl: "",
          });
          loadData(); // Refresh data
        }
      }
    } catch (error) {
      console.error("Error saving custom provider:", error);
    }
  };

  return {
    errors,
    setErrors,
    showForm,
    setShowForm,
    editingProvider,
    setEditingProvider,
    deleteConfirm,
    formData,
    setFormData,
    handleSave,
    handleAutoFill,
    handleEdit,
    handleDelete,
    confirmDelete,
    cancelDelete,
  };
}
