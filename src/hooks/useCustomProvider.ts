import { useState } from "react";
import { TYPE_PROVIDER } from "@/types";
import { AI_PROVIDERS } from "@/config";
import { useApp } from "@/contexts";
import {
  getCustomAiProviders,
  addCustomAiProvider,
  updateCustomAiProvider,
  removeCustomAiProvider,
  validateCurl,
} from "@/lib";

export function useCustomAiProviders() {
  const { loadData } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<TYPE_PROVIDER>({
    id: "",
    name: "",
    baseUrl: "",
    apiKey: "",
    protocol: "openai",
    streaming: true,
    responseContentPath: "choices[0].delta.content",
    isCustom: true,
    curl: "",
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleEdit = (providerId: string) => {
    const customProviders = getCustomAiProviders();
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
    const provider = AI_PROVIDERS.find((p) => p.id === providerId);
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
      const success = removeCustomAiProvider(deleteConfirm);
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
      const validation = validateCurl(dataToSave.curl, ["TEXT"]);
      if (!validation.isValid) {
        newErrors.curl = validation.message || "";
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
        const success = updateCustomAiProvider(editingProvider, {
          name: dataToSave.name,
          baseUrl: dataToSave.baseUrl,
          apiKey: dataToSave.apiKey,
          protocol: dataToSave.protocol,
          curl: dataToSave.curl,
          streaming: dataToSave.streaming,
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
            streaming: true,
            responseContentPath: "choices[0].delta.content",
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
          streaming: dataToSave.streaming,
          responseContentPath: dataToSave.responseContentPath,
        };

        const saved = addCustomAiProvider(newProvider);
        if (saved) {
          setShowForm(false);
          setFormData({
            id: "",
            name: "",
            baseUrl: "",
            apiKey: "",
            protocol: "openai",
            streaming: true,
            responseContentPath: "choices[0].delta.content",
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
